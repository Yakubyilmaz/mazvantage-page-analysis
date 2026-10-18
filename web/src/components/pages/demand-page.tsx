'use client';

/* ==========================================================================
   Maz Vantage — Demand Discovery (`/alpha/demand`)

   The page over `lib/demand-*`. It runs the engine in the browser on the
   bundled pilot capture (dated, and the date is printed everywhere a number
   is), or — when live data is connected — on freshly fetched quarterly
   statements for the same companies.

   Four sections: the themes (each chain read layer by layer, then company
   by company), the backtest (both periods, side by side, including where the
   engine failed), the evidence register, and the method with its limits.
   The backtest section exists because the spec made it essential and
   because a score with no track record shown beside it reads as a promise.
   ========================================================================== */

import * as React from 'react';
import { isNum } from '@/lib/format';
import { fetchFor, fetchTranscript, hasApiKey, mapLimited } from '@/lib/fmp';
import { fromStatements, readCapture, type Company, type DemandCapture } from '@/lib/demand-data';
import { CASE_BANDS, latestQuarterCase } from '@/lib/demand-case';
import { latestCalls, readCall, type VoiceCall } from '@/lib/management-voice';
import { analyseAll, type ChainResult, type CompanyResult, type LanguageEntry, type LayerResult } from '@/lib/demand-engine';
import { CHAINS, chainSymbols, EXPOSURE_SCORE } from '@/lib/demand-chains';
import { CAPEX_FLOORS, DEMAND_BANDS, PHASES, type Phase } from '@/lib/demand-cycle';
import { PRICED_IN_ASSUMPTIONS, PRICED_IN_LEVELS } from '@/lib/demand-pricedin';
import { DATA_TYPES, SOURCE_QUALITY, type DataType, type EvidenceRegister, type Reading } from '@/lib/demand-signals';
import { DEMAND_CALC_VERSION, GLUT_FACTOR, OPPORTUNITY_WEIGHTS } from '@/lib/demand-score';
import { FLAG_LABELS, type LanguageFlag } from '@/lib/demand-language';
import { ChipRail, Grid, Panel, Para, Warn, useHasKey, useQueryState } from '@/components/pages/page-parts';
import { ConfidencePill } from '@/components/alpha/alpha-view';
import { Button } from '@/components/ui/button';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

/* ---------- formatting ------------------------------------------------------------ */

const pct = (v: number | null | undefined, dp = 0) => (isNum(v) ? `${(v * 100).toFixed(dp)}%` : '—');
const pts = (v: number | null | undefined) => (isNum(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)} pts` : '—');
const sc = (v: number | null | undefined) => (isNum(v) ? String(Math.round(v)) : '—');

function fmtValue(r: Reading) {
  if (!isNum(r.value)) return '—';
  if (r.unit === 'pct') return pct(r.value);
  if (r.unit === 'pp') return pts(r.value);
  if (r.unit === 'x') return `${r.value.toFixed(2)}×`;
  return String(Math.round(r.value));
}

const tone = (v: number | null | undefined, invert = false) => {
  if (!isNum(v)) return 'bg-accent text-muted-foreground';
  const x = invert ? 100 - v : v;
  return x >= 70 ? 'bg-up/15 text-up' : x >= 55 ? 'bg-up/8 text-up' : x >= 40 ? 'bg-accent text-foreground' : x >= 25 ? 'bg-down/8 text-down' : 'bg-down/15 text-down';
};

function Score({ v, invert = false, title }: { v: number | null | undefined; invert?: boolean; title?: string }) {
  return <span title={title} className={cn('inline-block min-w-9 rounded px-1.5 text-center text-tiny font-semibold tnum', tone(v, invert))}>{sc(v)}</span>;
}

function TypeBadge({ type }: { type: DataType }) {
  return (
    <span title={DATA_TYPES[type].blurb}
      className={cn('inline-block cursor-help whitespace-nowrap rounded border border-border px-[6px] py-px text-[9px] font-bold uppercase tracking-[.07em] text-muted-foreground',
        type === 'FORECAST' && 'border-dashed', type === 'INFERRED' && 'border-dashed opacity-80', type === 'ESTIMATE' && 'italic')}>
      {DATA_TYPES[type].label}
    </span>
  );
}

const PHASE_TONE: Record<Phase, string> = {
  'early-cycle': 'bg-up/15 text-up',
  inflection: 'bg-up/8 text-up',
  tight: 'bg-warning/15 text-foreground',
  overbuilding: 'bg-down/15 text-down',
  downturn: 'bg-down/8 text-down',
  cooling: 'bg-accent text-muted-foreground',
  quiet: 'bg-accent text-muted-foreground',
  unknown: 'bg-accent text-muted-foreground italic',
};

function PhasePill({ phase }: { phase: Phase }) {
  return <span title={PHASES[phase].blurb} className={cn('inline-block cursor-help whitespace-nowrap rounded-full px-2.5 py-0.5 text-micro font-semibold', PHASE_TONE[phase])}>{PHASES[phase].label}</span>;
}

/* ---------- data ------------------------------------------------------------------- */

interface DeskData {
  capture: DemandCapture;
  register: EvidenceRegister;
  language: LanguageEntry[];
  backtest: any;
  /** the business reader's readings of each company's newest call (`management-voice.json`) */
  voice: VoiceCall[];
}

function useDeskData() {
  const [data, setData] = React.useState<DeskData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    // The voice file is optional: without it the quotes are missing, nothing else is.
    const voice = fetch('/data/management-voice.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([...['demand-capture', 'demand-evidence', 'demand-language', 'demand-backtest'].map((f) =>
      fetch(`/data/${f}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(f))))), voice])
      .then(([cap, reg, lang, bt, v]) => {
        if (!live) return;
        setData({ capture: readCapture(cap), register: reg, language: lang?.calls || [], backtest: bt, voice: Array.isArray(v?.calls) ? v.calls : [] });
      })
      .catch(() => live && setError('The Demand Discovery data could not be loaded.'));
    return () => { live = false; };
  }, []);
  return { data, error };
}

/** Re-read every chain company from live quarterly statements. Twelve quarters each. */
async function liveCapture(base: DemandCapture, onStep: (done: number, total: number) => void): Promise<DemandCapture> {
  const symbols = chainSymbols();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10);
  let done = 0;
  const rows = await mapLimited(symbols, async (s) => {
    const [inc, bal, cf, px] = await Promise.all([
      fetchFor('incomeQ', s), fetchFor('balanceQ', s), fetchFor('cashflowQ', s), fetchFor('prices', s, { from, to }),
    ]);
    onStep(++done, symbols.length);
    if (inc.status !== 'ok') return null;
    const arr = (r: any) => (r.status === 'ok' && Array.isArray(r.data) ? r.data : []);
    return fromStatements(s, base.companies[s]?.name || s, arr(inc), arr(bal), arr(cf), arr(px));
  }, 3);
  const companies = { ...base.companies };
  for (const c of rows) if (c && c.quarters.length >= 8) companies[c.symbol] = c;
  return { ...base, capturedAt: to, companies };
}

/* ---------- the desk --------------------------------------------------------------- */

type Section = 'themes' | 'backtest' | 'evidence' | 'method';
const SECTIONS: { id: Section; label: string; tag: string }[] = [
  { id: 'themes', label: 'Themes', tag: 'Chains, layers, companies' },
  { id: 'backtest', label: 'Backtest', tag: '1999–2017 and 2019–2026' },
  { id: 'evidence', label: 'Evidence', tag: 'The register, with sources' },
  { id: 'method', label: 'Method & limits', tag: 'How it scores, what it cannot see' },
];

export function DemandDesk() {
  const q = useQueryState();
  const has = useHasKey();
  const { data, error } = useDeskData();
  const [live, setLive] = React.useState<DemandCapture | null>(null);
  const [progress, setProgress] = React.useState<string | null>(null);
  const section = (SECTIONS.some((s) => s.id === q.get('dd')) ? q.get('dd') : 'themes') as Section;
  const theme = CHAINS.some((c) => c.id === q.get('theme')) ? q.get('theme')! : CHAINS[0].id;

  const capture = live || data?.capture || null;
  const results = React.useMemo(() => (capture && data
    ? analyseAll({ capture, register: data.register, asOf: capture.capturedAt, language: data.language })
    : null), [capture, data]);

  const refresh = async () => {
    if (!data || !hasApiKey()) return;
    setProgress('Reading live filings…');
    try {
      const c = await liveCapture(data.capture, (d, t) => setProgress(`Reading live filings… ${d} of ${t}`));
      setLive(c);
      setProgress(null);
    } catch {
      setProgress('Live filings could not be read; showing the bundled reading.');
    }
  };

  if (error) return <div className="pt-6"><Warn>{error}</Warn></div>;
  if (!data || !results || !capture) return <p className="pt-6 text-13 text-muted-foreground">Loading the pilot…</p>;

  return (
    <div className="grid gap-5 pt-6">
      <Warn>
        <b>A research tool, not a prediction.</b> Demand Discovery reads filed figures and published evidence to say where each part of a supply chain sits in its cycle and how much growth the price already assumes. In its own backtest the shortage signal did <b>not</b> predict twelve-month returns; the priced-in gate and the supply-cut signal held up better. The Backtest section shows the numbers.
      </Warn>
      <div className="flex flex-wrap items-center gap-3 text-13 text-muted-foreground">
        <span>{live ? `Live filings read ${capture.capturedAt}` : `Bundled reading captured ${capture.capturedAt}`} · engine v{DEMAND_CALC_VERSION} · weights unvalidated</span>
        {has && !live ? <Button size="sm" variant="outline" onClick={refresh} disabled={!!progress}>Re-read with live filings</Button> : null}
        {live ? <Button size="sm" variant="ghost" onClick={() => setLive(null)}>Back to the bundled reading</Button> : null}
        {progress ? <span>{progress}</span> : null}
      </div>
      {live ? <p className="text-tiny text-muted-foreground">Live mode reads twelve quarters per company, against up to thirty-eight in the bundled reading, so through-cycle cash margins and the capex history tests rest on less.</p> : null}
      <ChipRail label="Demand Discovery sections" items={SECTIONS} active={section} onChoose={(id) => q.set({ dd: id === 'themes' ? null : id })} />
      {section === 'themes'
        ? <ThemesSection results={results} theme={theme} onTheme={(id) => q.set({ theme: id === CHAINS[0].id ? null : id })}
            capture={capture} voice={data.voice} live={!!live} />
        : section === 'backtest' ? <BacktestSection bt={data.backtest} />
          : section === 'evidence' ? <EvidenceSection register={data.register} asOf={capture.capturedAt} />
            : <MethodSection />}
    </div>
  );
}

/* ---------- themes ------------------------------------------------------------------- */

function ThemesSection({ results, theme, onTheme, capture, voice, live }: {
  results: ChainResult[]; theme: string; onTheme: (id: string) => void; capture: DemandCapture; voice: VoiceCall[]; live: boolean;
}) {
  const r = results.find((x) => x.theme === theme) || results[0];
  return (
    <div className="grid gap-5">
      <ChipRail label="Themes" active={r.theme} onChoose={(id) => onTheme(id!)}
        items={results.map((x) => ({ id: x.theme, label: x.name.replace(/ \(control.*\)$/, ''), tag: x.kind === 'control' ? 'Control case' : `Demand ${sc(x.demand_score)} · supply ${sc(x.supply_constraint_score)}` }))} />
      <ChainHeader r={r} />
      <ChainLayers r={r} />
      <CompanyTable r={r} capture={capture} voice={voice} live={live} />
      <ChainEvidence r={r} />
    </div>
  );
}

function ScoreTile({ label, v, sub }: { label: string; v: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border p-3">
      <span className="text-micro font-medium uppercase tracking-[.06em] text-muted-foreground">{label}</span>
      <span className="text-xl font-bold tnum">{v}</span>
      {sub ? <span className="text-tiny text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function ChainHeader({ r }: { r: ChainResult }) {
  return (
    <Panel title={r.name}>
      <Para>{r.question}</Para>
      {r.kind === 'control'
        ? <Warn>A control case: a theme where demand grew and the stocks still fell. It is here to test the engine, not as an idea.</Warn>
        : null}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <ScoreTile label="Demand" v={sc(r.demand_score)} sub="Layer cohorts: growth, acceleration, breadth" />
        <ScoreTile label="Acceleration" v={sc(r.acceleration_score)} sub="Two newest quarters against the four before" />
        <ScoreTile label="Supply constraint" v={sc(r.supply_constraint_score)} sub="Shortage tests and capacity lead times" />
        <ScoreTile label="Evidence" v={<ConfidencePill level={r.confidence} />} sub={`${r.signals.length} published figures, ${r.sources.length} sources`} />
        {r.commodity ? <ScoreTile label={r.commodity.label} v={isNum(r.commodity.price) ? r.commodity.price.toFixed(2) : '—'} sub={`${pct(r.commodity.change1y)} in a year · ${pct(r.commodity.change3y)} in three`} /> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <h3 className="text-13 font-bold">The case, from the evidence</h3>
          <ul className="grid gap-1.5">{r.thesis.map((t) => <li key={t} className="text-13 leading-relaxed">{t}</li>)}</ul>
        </div>
        <div className="grid gap-2">
          <h3 className="text-13 font-bold">Against it</h3>
          <ul className="grid gap-1.5">{r.bear.length ? r.bear.map((t) => <li key={t} className="text-13 leading-relaxed">{t}</li>) : <li className="text-13 text-muted-foreground">Nothing in the readings argues against it — which is itself worth distrusting.</li>}</ul>
        </div>
      </div>
      <p className="text-tiny text-muted-foreground">Every sentence above is a reading's own calculation or an evidence row's claim. None is written by a model.</p>
    </Panel>
  );
}

function LayerCard({ l, chainEdges }: { l: LayerResult; chainEdges: ChainResult['supply_chain'] }) {
  const c = l.cohort;
  const out = chainEdges.filter((e) => e.from === l.layer.id);
  return (
    <div className="grid content-start gap-2 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-13 font-bold">{l.layer.name}</h3>
        <span className="text-micro text-muted-foreground">{c.metric === 'capex' ? 'capital spending' : 'revenue'} · {c.measured.join(', ') || 'none measured'}</span>
      </div>
      <p className="text-tiny leading-relaxed text-muted-foreground">{l.layer.role}</p>
      <div className="grid grid-cols-3 gap-2 text-tiny">
        <div><div className="text-muted-foreground">Growth</div><div className="font-semibold tnum">{pct(c.recentGrowth)}</div></div>
        <div><div className="text-muted-foreground">Acceleration</div><div className="font-semibold tnum">{pts(c.acceleration)}</div></div>
        <div><div className="text-muted-foreground">Breadth</div><div className="font-semibold tnum">{isNum(c.breadth) ? `${Math.round(c.breadth * 100)}%` : '—'}</div></div>
      </div>
      <div className="flex flex-wrap gap-2 text-tiny">
        <span>Demand <Score v={c.demandScore} /></span>
        <span>Supply <Score v={l.supplyScore} /></span>
        {isNum(c.glutRisk) ? <span>Glut risk <Score v={c.glutRisk} invert /></span> : null}
      </div>
      <p className="text-tiny text-muted-foreground"><b className="font-semibold text-foreground">Lead time</b> {l.layer.leadTime.years[0]}–{l.layer.leadTime.years[1]} years <TypeBadge type={l.layer.leadTime.basis} /> {l.layer.leadTime.note}</p>
      {l.layer.bottleneck ? <p className="text-tiny text-muted-foreground"><b className="font-semibold text-foreground">Bottleneck</b> {l.layer.bottleneck}</p> : null}
      {l.upstream.map((u) => (
        <p key={u.from} className="rounded-md bg-up/8 px-2 py-1 text-tiny">
          <b>Upstream has inflected.</b> {u.fromName} is accelerating {pts(u.fromAcceleration)}; this layer {pts(u.thisAcceleration)}. Expected lag {u.lag[0]}–{u.lag[1]} quarters.
        </p>
      ))}
      {out.map((e) => <p key={e.to} className="text-tiny text-muted-foreground">→ feeds <b className="font-semibold text-foreground">{e.to}</b> in {e.lagQuarters[0]}–{e.lagQuarters[1]} quarters: {e.why}</p>)}
      {l.layer.uncaptured?.length ? <p className="text-tiny italic text-muted-foreground">Not measured here: {l.layer.uncaptured.join(', ')}.</p> : null}
    </div>
  );
}

function ChainLayers({ r }: { r: ChainResult }) {
  return (
    <Panel title="The chain, layer by layer">
      <Para>Each layer is read as one cohort: members summed by calendar quarter, weighted by the share of their revenue that belongs here. An <i>indirect</i> member is listed but never moves its layer.</Para>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
        {r.layers.map((l) => <LayerCard key={l.layer.id} l={l} chainEdges={r.supply_chain} />)}
      </div>
    </Panel>
  );
}

function ReadingList({ title, readings, invert = false }: { title: string; readings: Reading[]; invert?: boolean }) {
  return (
    <div className="grid content-start gap-2">
      <h4 className="text-13 font-bold">{title}</h4>
      <ul className="grid gap-2">
        {readings.map((x) => (
          <li key={x.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <Score v={x.score} invert={invert} />
            <div className="grid gap-0.5">
              <span className="text-tiny font-semibold">{x.label} <span className="font-normal text-muted-foreground">{fmtValue(x)}</span></span>
              <span className="text-tiny leading-relaxed text-muted-foreground">{x.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- the bull and bear case --------------------------------------------------- */

type CallState = { call: VoiceCall | null; live: boolean; loading: boolean };

/**
 * The newest call on or before `asOf`: read live when data is connected (two
 * requests: the call index and the call), otherwise the saved reading. A
 * failed live read falls back to the saved one rather than to nothing.
 */
function useNewestCall(symbol: string, voice: VoiceCall[], asOf: string): CallState {
  const saved = React.useMemo(() => voice.filter((v) => v.symbol === symbol && v.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null, [voice, symbol, asOf]);
  const [state, setState] = React.useState<CallState>({ call: saved, live: false, loading: hasApiKey() });
  React.useEffect(() => {
    let live = true;
    if (!hasApiKey()) { setState({ call: saved, live: false, loading: false }); return () => { live = false; }; }
    setState({ call: saved, live: false, loading: true });
    (async () => {
      const idx = await fetchFor('transcriptDates', symbol);
      const [newest] = latestCalls(idx.status === 'ok' ? idx.data : null, 1, asOf);
      if (newest && (!saved || newest.date > saved.date)) {
        const t = await fetchTranscript(symbol, newest.year, newest.quarter);
        const content = String((t.data as any)?.content || '');
        if (t.status === 'ok' && content) {
          if (live) setState({ call: { symbol, period: `${newest.year} Q${newest.quarter}`, date: newest.date, reading: readCall(content) }, live: true, loading: false });
          return;
        }
      }
      if (live) setState({ call: saved, live: false, loading: false });
    })().catch(() => live && setState({ call: saved, live: false, loading: false }));
    return () => { live = false; };
  }, [symbol, asOf, saved]);
  return state;
}

function CaseGroup({ title, children, empty }: { title: string; children: React.ReactNode[]; empty?: string }) {
  if (!children.length && !empty) return null;
  return (
    <div className="grid gap-1">
      <h5 className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{title}</h5>
      {children.length ? <ul className="grid gap-1">{children}</ul> : <p className="text-tiny italic text-muted-foreground">{empty}</p>}
    </div>
  );
}

const Line = ({ text }: { text: string }) => <li className="text-tiny leading-relaxed">{text}</li>;
const QuoteLine = ({ text, who, words }: { text: string; who: string; words: string[] }) => (
  <li className="text-tiny leading-relaxed" title={words.length ? `Scored on: ${words.join(', ')}` : undefined}>
    “{text}” <span className="text-muted-foreground">— {who}</span>
  </li>
);

function BullBear({ c, company, voice, asOf }: { c: CompanyResult; company: Company | null; voice: VoiceCall[]; asOf: string }) {
  const qc = React.useMemo(() => (company ? latestQuarterCase(company.quarters.filter((q) => q.filed <= asOf)) : null), [company, asOf]);
  const { call, live, loading } = useNewestCall(c.symbol, voice, asOf);
  const r = call?.reading || null;
  const lang = c.language?.reading;
  const callName = call ? `${call.period}${/call\)?$/.test(call.period) ? '' : ' call'}, ${call.date}` : null;
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-13 font-bold">Bull case and bear case</h4>
        <span className="text-tiny text-muted-foreground">
          {qc ? `Newest quarter to ${qc.quarter}, filed ${qc.filed}` : 'No quarter on file'}
          {callName ? ` · ${callName}${live ? ' (read live)' : ''}` : loading ? ' · reading the newest call…' : ''}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-3 border-l-[3px] border-up/50 pl-3">
          <h5 className="text-13 font-bold text-up">For</h5>
          <CaseGroup title="In the latest quarter" empty="Nothing in the newest quarter cleared a threshold in its favour.">
            {(qc?.bull || []).map((t) => <Line key={t} text={t} />)}
          </CaseGroup>
          <CaseGroup title="In management’s words" empty={r ? 'No sentence argued for the business clearly enough to quote.' : loading ? undefined : 'No call has been read for this company.'}>
            {(r?.topPositive || []).slice(0, 3).map((q) => <QuoteLine key={q.text} text={q.text} who={q.speaker} words={q.positives} />)}
          </CaseGroup>
          <CaseGroup title="From the engine’s tests">
            {c.thesis.map((t) => <Line key={t} text={t} />)}
          </CaseGroup>
        </div>
        <div className="grid content-start gap-3 border-l-[3px] border-down/50 pl-3">
          <h5 className="text-13 font-bold text-down">Against</h5>
          <CaseGroup title="In the latest quarter" empty="Nothing in the newest quarter cleared a threshold against it.">
            {(qc?.bear || []).map((t) => <Line key={t} text={t} />)}
          </CaseGroup>
          <CaseGroup title="What management conceded" empty={r ? 'Management conceded nothing the reader could find.' : undefined}>
            {(r?.topNegative || []).slice(0, 3).map((q) => <QuoteLine key={q.text} text={q.text} who={q.speaker} words={q.negatives} />)}
          </CaseGroup>
          <CaseGroup title="What the analysts pressed on">
            {(r?.concerns || []).slice(0, 2).map((q) => <QuoteLine key={q.text} text={q.text} who={q.firm ? `${q.analyst}, ${q.firm}` : q.analyst} words={q.negatives} />)}
          </CaseGroup>
          <CaseGroup title="From the engine’s tests" empty="No test fires against it.">
            {c.bear.map((t) => <Line key={t} text={t} />)}
          </CaseGroup>
        </div>
      </div>
      <p className="text-tiny leading-relaxed text-muted-foreground">
        {r ? `Tone of the call ${r.score === null ? 'not readable' : `${r.score >= 0 ? '+' : ''}${r.score}`} (${r.category}): ${r.sentences} business sentences from management, ${r.positive} for and ${r.negative} against. ` : ''}
        {lang ? `Read for demand alone, the ${c.language!.period} call scored ${lang.score ?? '—'} (${lang.category})${Object.keys(lang.flags).length ? `, flags ${Object.entries(lang.flags).map(([k, n]) => `${FLAG_LABELS[k as LanguageFlag]} ×${n}`).join(', ')}` : ''}. ` : ''}
        Quotes are chosen by a rule-based reader, cut at 25 words; hover one for the words it was scored on. None of this is in the score.
        The quarter lines need revenue growth of {Math.round(CASE_BANDS.revenueFor * 100)}% or a fall, a margin move of {Math.round(CASE_BANDS.marginPts * 100)} point, free cash flow of {Math.round(CASE_BANDS.cashFor * 100)}% of revenue or a burn, prepayments moving {Math.round(CASE_BANDS.prepayments * 100)}%, or capex outrunning revenue by {Math.round(CASE_BANDS.capexOverRevenue * 100)} points; anything inside those bands is left out.
      </p>
    </div>
  );
}

function CompanyDetail({ c, company, voice, asOf }: { c: CompanyResult; company: Company | null; voice: VoiceCall[]; asOf: string }) {
  const nav = useNav();
  return (
    <div className="grid gap-4 bg-accent/30 p-4">
      <BullBear c={c} company={company} voice={voice} asOf={asOf} />
      <div className="grid gap-4 lg:grid-cols-3">
        <ReadingList title={`Shortage signature ${sc(c.shortage.score)}`} readings={c.shortage.readings} />
        <ReadingList title={`Glut warning ${sc(c.glut.risk)} (${c.glut.level})`} readings={c.glut.readings} invert />
        <ReadingList title={`Financial quality ${sc(c.quality.score)}`} readings={c.quality.readings} />
      </div>
      <div className="grid gap-1">
        <h4 className="text-13 font-bold">Priced in? {c.pricedIn.level !== 'unknown' ? PRICED_IN_LEVELS[c.pricedIn.level].label : 'Not readable'}</h4>
        <p className="text-tiny leading-relaxed text-muted-foreground">{c.pricedIn.detail}</p>
      </div>
      <div className="grid gap-1">
        <h4 className="text-13 font-bold">Exposure: {c.member.exposure} <TypeBadge type={c.member.basis} /></h4>
        <p className="text-tiny leading-relaxed text-muted-foreground">{c.member.evidence}</p>
      </div>
      {c.confidence.reasons.length ? <p className="text-tiny text-muted-foreground"><b className="text-foreground">Why not more confident:</b> {c.confidence.reasons.join(' ')}</p> : null}
      {c.price ? <p className="text-tiny text-muted-foreground">Price {c.price.close.toFixed(2)} on {c.price.date}.</p> : null}
      {/* The company's own page holds the newest call against the one
          before, and what the firms publish about it and its industry. */}
      <button type="button" onClick={() => nav.goSymbolTab('Research', c.symbol)} className="justify-self-start text-tiny font-semibold text-primary hover:underline">
        {c.symbol}&apos;s Research report: the Alpha Signal reading, the newest call against the one before, and what the firms are publishing ›
      </button>
    </div>
  );
}

function CompanyTable({ r, capture, voice, live }: { r: ChainResult; capture: DemandCapture; voice: VoiceCall[]; live: boolean }) {
  const [open, setOpen] = React.useState<string | null>(null);
  /* The table scrolls sideways on a narrow screen; the open detail is pinned
     to the visible width so it reads without scrolling with the columns. */
  const scroller = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setVisible(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <Panel title="Companies">
      <Para>Score = weighted geometric mean of demand, supply, exposure and quality, then cut by the priced-in gate and the glut warning. The phase says where the company's own filings put it in the cycle. Click a row for every test behind it.</Para>
      <div ref={scroller} className="overflow-x-auto scroll-thin">
        <table className="w-full border-collapse text-13">
          <thead>
            <tr className="border-b border-border text-left text-micro uppercase tracking-[.05em] text-muted-foreground">
              {['Company', 'Layer', 'Exposure', 'Phase', 'Growth', 'Shortage', 'Glut', 'Priced in', 'Quality', 'Base → score', 'Confidence'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium first:pl-0">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.companies.map((c) => {
              const id = `${c.layer}-${c.symbol}`;
              return (
                <React.Fragment key={id}>
                  <tr className="cursor-pointer border-b border-border hover:bg-accent/50" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
                    <td className="px-3 py-2 first:pl-0"><b>{c.symbol}</b> <span className="text-tiny text-muted-foreground">{c.name}</span></td>
                    <td className="px-3 py-2 text-tiny">{c.layerName}</td>
                    <td className="px-3 py-2 text-tiny"><span title={c.member.evidence}>{c.member.exposure} ({EXPOSURE_SCORE[c.member.exposure]})</span> <TypeBadge type={c.member.basis} /></td>
                    <td className="px-3 py-2"><PhasePill phase={c.phase} /></td>
                    <td className="px-3 py-2 text-tiny tnum" title="Year-on-year, two newest quarters; acceleration against the four before">{pct(c.growth.recent)} <span className="text-muted-foreground">{pts(c.growth.acceleration)}</span></td>
                    <td className="px-3 py-2"><Score v={c.shortage.score} /></td>
                    <td className="px-3 py-2"><Score v={c.glut.risk} invert /></td>
                    <td className="px-3 py-2 text-tiny" title={c.pricedIn.detail}>{c.pricedIn.level === 'unknown' ? '—' : PRICED_IN_LEVELS[c.pricedIn.level].label} <span className="text-muted-foreground tnum">{pct(c.pricedIn.implied)}/yr</span></td>
                    <td className="px-3 py-2"><Score v={c.quality.score} /></td>
                    <td className="whitespace-nowrap px-3 py-2 tnum"><span className="text-muted-foreground">{sc(c.opportunity.base)} →</span> <Score v={c.opportunity.score} /></td>
                    <td className="px-3 py-2"><ConfidencePill level={c.confidence.level} /></td>
                  </tr>
                  {open === id ? (
                    <tr><td colSpan={11} className="p-0">
                      <div className="sticky left-0" style={visible ? { width: visible } : undefined}>
                        <CompanyDetail c={c} company={capture.companies[c.symbol] || null} voice={voice} asOf={live ? new Date().toISOString().slice(0, 10) : capture.capturedAt} />
                      </div>
                    </td></tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function EvidenceRow({ e, sourceName }: { e: ChainResult['signals'][number]; sourceName: string }) {
  const value = e.unit === 'growth' || e.unit === 'cagr' || e.unit === 'share of demand' ? pct(e.value) : `${e.value.toLocaleString('en-US')} ${e.unit}`;
  return (
    <div className="grid content-start gap-1.5 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={cn('text-lg font-bold tnum', e.direction > 0 && 'text-up', e.direction < 0 && 'text-down')}>{value}</span>
        <TypeBadge type={e.type} />
      </div>
      <p className="text-13 leading-relaxed">{e.claim}</p>
      <p className="text-tiny text-muted-foreground">{e.period} · <a className="text-primary hover:underline" href={e.url} target="_blank" rel="noreferrer">{sourceName}</a> · published {e.published}</p>
      {e.note ? <p className="text-tiny italic text-muted-foreground">{e.note}</p> : null}
    </div>
  );
}

function ChainEvidence({ r }: { r: ChainResult }) {
  const name = (id: string) => r.sources.find((s) => s.id === id)?.name || id;
  return (
    <Panel title="Published evidence for this theme">
      {r.signals.length
        ? <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">{[...r.signals].sort((a, b) => b.published.localeCompare(a.published)).map((e) => <EvidenceRow key={e.id} e={e} sourceName={name(e.sourceId)} />)}</div>
        : <Para>No published figure has been entered for this theme. Its scores rest on filings alone, and its confidence says so.</Para>}
    </Panel>
  );
}

/* ---------- backtest ---------------------------------------------------------------- */

function BucketTable({ title, a, b, label = (k) => k }: { title: string; a: any[]; b: any[]; label?: (key: string) => string }) {
  const keys = [...new Set([...a, ...b].map((x) => x.key))].sort();
  const cell = (x: any) => (x ? <><b className="tnum">{pct(x.medianExcess12)}</b> <span className="text-muted-foreground tnum">· {pct(x.medianExcess24)} · {isNum(x.hitRate12) ? `${Math.round(x.hitRate12 * 100)}%` : '—'} · n={x.n}</span></> : '—');
  return (
    <div className="grid gap-2">
      <h3 className="text-13 font-bold">{title}</h3>
      <Grid heads={['Bucket', '1999–2017 (out of sample)', '2019–2026 (in sample)']}
        rows={keys.map((k) => [label(k), cell(b.find((x) => x.key === k)), cell(a.find((x) => x.key === k))])} />
    </div>
  );
}

function BacktestSection({ bt }: { bt: any }) {
  const ins = bt.inSample.summary;
  const oos = bt.outOfSample.summary;
  const rho = (v: number | null) => (isNum(v) ? v.toFixed(2) : '—');
  return (
    <div className="grid gap-5">
      <Panel title="What was tested">
        <Para>For every captured company and every quarterly filing, the engine was run on exactly what was public that day; the stock was bought at the first weekly close after the filing and measured against the S&P 500 ETF over the next 12 and 24 months. <b className="text-foreground">Out of sample</b> is 1999–2017 ({oos.observations} filings, eight companies): history nobody looked at while writing the rules. <b className="text-foreground">In sample</b> is 2019–2026 ({ins.observations} filings), the period the rules and the themes were chosen in — so it flatters them.</Para>
        <Warn><b>Read these as descriptions, not statistics.</b> Twelve-month windows from consecutive quarters overlap by nine months, the universe is a handful of chosen companies, and the in-sample themes were picked knowing they worked — in sample the median filing beat the market by {pct(ins.all?.[0]?.medianExcess12)} over twelve months, which a list of 2026's AI winners will do whatever the signal says. Cells show the <b>median</b> 12-month excess return, then the 24-month median, the 12-month hit rate and the count.</Warn>
        <Grid heads={['Rank correlation with 12-month excess return', '1999–2017', '2019–2026']}
          rows={[
            ['Shortage signature', rho(oos.spearmanShortage12), rho(ins.spearmanShortage12)],
            ['Glut risk', rho(oos.spearmanGlut12), rho(ins.spearmanGlut12)],
            ['Revenue acceleration', rho(oos.spearmanAcceleration12), rho(ins.spearmanAcceleration12)],
            ['Growth the price implies', rho(oos.spearmanImplied12), rho(ins.spearmanImplied12)],
          ]} />
      </Panel>
      <Panel title="By cycle phase">
        <BucketTable title="Median excess return after a filing in each phase" a={ins.byPhase} b={oos.byPhase} label={(k) => PHASES[k as Phase]?.label || k} />
      </Panel>
      <Panel title="By shortage signature, priced-in level and supply discipline">
        <BucketTable title="Shortage signature" a={ins.byShortage} b={oos.byShortage} />
        <BucketTable title="Priced in?" a={ins.byPricedIn} b={oos.byPricedIn}
          label={(k) => (k in PRICED_IN_LEVELS ? PRICED_IN_LEVELS[k as keyof typeof PRICED_IN_LEVELS].label : 'Not readable')} />
        <BucketTable title="Capex cut by a fifth in a downturn" a={ins.byDiscipline} b={oos.byDiscipline} />
        <BucketTable title="Everything" a={ins.all} b={oos.all} />
      </Panel>
      <Panel title="The chain through time: AI compute">
        <Para>Each layer's cohort at every quarter end, read point in time, with the next twelve months of its members against the market. The memory and test layers were flagged as not yet caught up with accelerators from late 2023; over twelve months that looked wrong, over twenty-four it did not.</Para>
        <PropagationTable rows={bt.propagation['ai-compute']} />
      </Panel>
    </div>
  );
}

function PropagationTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return null;
  const layers = rows[0].layers.map((l: any) => l.id);
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full border-collapse text-tiny">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">As of</th>
            {layers.map((id: string) => <th key={id} className="px-2 py-1.5 font-medium">{id}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.asOf} className="border-b border-border">
              <td className="whitespace-nowrap px-2 py-1.5 tnum">{t.asOf}</td>
              {t.layers.map((l: any) => (
                <td key={l.id} className={cn('whitespace-nowrap px-2 py-1.5 tnum', l.upstream.length && 'bg-up/8')}>
                  {pts(l.acceleration)}
                  <span className="text-muted-foreground"> · {l.next12.filter((x: any) => isNum(x.excess12)).map((x: any) => `${x.symbol} ${pct(x.excess12)}`).join(' ') || '—'}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-tiny text-muted-foreground">Acceleration of the layer's revenue (or capex for cloud spending) · each member's next-12-month excess return. Shaded: an upstream layer had inflected and this one had not caught up.</p>
    </div>
  );
}

/* ---------- evidence register ------------------------------------------------------- */

function EvidenceSection({ register, asOf }: { register: EvidenceRegister; asOf: string }) {
  const themes = [...new Set(register.evidence.map((e) => e.theme))];
  const src = new Map(register.sources.map((s) => [s.id, s]));
  return (
    <div className="grid gap-5">
      <Panel title="How the register works">
        <Para>Every figure was read by a person from the original publication and entered with its source, the day it became public, and its type. Nothing is scraped and nothing is reproduced beyond the figure and a one-line claim in our words. The backtest never reads a row before its publication date.</Para>
        <Grid heads={['Kind of source', 'Starting quality']} rows={Object.entries(SOURCE_QUALITY).map(([k, v]) => [k.replace('-', ' '), String(v)])} />
      </Panel>
      {themes.map((t) => (
        <Panel key={t} title={`Theme: ${t}`}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            {register.evidence.filter((e) => e.theme === t && e.published <= asOf).map((e) => <EvidenceRow key={e.id} e={e} sourceName={src.get(e.sourceId)?.name || e.sourceId} />)}
          </div>
        </Panel>
      ))}
      <Panel title="Sources">
        <Grid heads={['Source', 'Publisher', 'Kind', 'Access']}
          rows={register.sources.map((s) => [<a key={s.id} className="text-primary hover:underline" href={s.url} target="_blank" rel="noreferrer">{s.name}</a>, s.publisher, s.kind.replace('-', ' '), s.access])} />
      </Panel>
    </div>
  );
}

/* ---------- method & limits ------------------------------------------------------------ */

function MethodSection() {
  const b = DEMAND_BANDS;
  return (
    <div className="grid gap-5">
      <Panel title="The idea">
        <Para>Spending moves down a supply chain: one layer's capital spending is the next layer's revenue a few quarters later. Demand Discovery reads each layer of a hand-written chain as a cohort of companies, measures whether its demand is accelerating and whether supply is keeping up, and asks how much of that the price of each company already assumes.</Para>
        <Para>It is built in the order the backtest supports: filings first (point-in-time, every quarter), published evidence second (read by hand, dated), management language last (a rule-based reader, shown but not scored).</Para>
      </Panel>
      <Panel title="Shortage signature and glut warning">
        <Grid heads={['Test', 'What it reads', 'Scores 0 at', 'Scores 100 at']}
          rows={[
            ['Demand acceleration', 'Year-on-year revenue growth, two newest quarters against the four before', pts(b.acceleration[0]), pts(b.acceleration[1])],
            ['Pricing power', 'Gross margin against a year earlier', pts(b.pricing[0]), pts(b.pricing[1])],
            ['Inventory tightness', 'Days of cost of sales held, against a year earlier', pct(b.inventory[0]), pct(b.inventory[1])],
            ['Customer prepayments', 'Contract liabilities against a year earlier (only when material)', pct(b.prepayments[0]), pct(b.prepayments[1])],
            ['Capacity build', `Trailing capex growth (only when capex is at least ${pct(CAPEX_FLOORS.capacityFloor)} of revenue)`, pct(b.capacity[0]), pct(b.capacity[1])],
            ['Glut: capex outrunning revenue', `Capex growth minus revenue growth (capex at least ${pct(CAPEX_FLOORS.glutFloor)} of revenue)`, pts(b.capexOverRevenue[0]), pts(b.capexOverRevenue[1])],
            ['Glut: inventory building', 'Inventory days up; halved when margins widen, halved again when prepayments outgrow it', pct(b.inventoryBuild[0]), pct(b.inventoryBuild[1])],
            ['Glut: margin rolling over', 'Gross margin down on a year earlier', pts(b.marginRollover[0]), pts(b.marginRollover[1])],
            ['Glut: growth slowing', 'Acceleration negative', pts(b.deceleration[0]), pts(b.deceleration[1])],
          ]} />
      </Panel>
      <Panel title="The score">
        <Grid heads={['Component', 'Weight']} rows={Object.entries(OPPORTUNITY_WEIGHTS).map(([k, v]) => [k, `${Math.round(v * 100)}%`])} />
        <Para>Combined as a weighted geometric mean, so one weak component drags the whole score — an opportunity is an AND, not an average. Then multiplied by two gates, each at most 1: the priced-in gate ({Object.values(PRICED_IN_LEVELS).map((l) => `${l.label} ×${l.factor}`).join(', ')}) and the glut warning ({Object.entries(GLUT_FACTOR).map(([k, v]) => `${k} ×${v}`).join(', ')}).</Para>
        <Para>The priced-in gate solves for the ten-year revenue growth the enterprise value implies at a {PRICED_IN_ASSUMPTIONS.discountRate * 100}% discount rate and {PRICED_IN_ASSUMPTIONS.terminalGrowth * 100}% terminal growth, on both the trailing and the through-cycle cash margin, and reads the midpoint.</Para>
      </Panel>
      <Panel title="Limits">
        <ul className="grid gap-2">
          {[
            ['The chains are hand-written.', 'No data source says who supplies whom. Membership, exposure and lags are judgement, each with its basis printed.'],
            ['The universe is small and chosen.', 'Twenty-nine companies, picked in 2026 for themes that were already famous; nineteen of them are in the AI chain, added in October 2026 because they were the obvious names. That is survivorship bias in its plainest form. A real discovery run needs every industry, scored point in time, with delisted companies included.'],
            ['Filings lag prices.', 'A quarter is public four to ten weeks after it ends, and markets move on guidance and orders before that. The backtest shows the cost.'],
            ['Some suppliers cannot be measured.', 'SK hynix, Samsung, Kioxia, TSMC, ASML, Tokyo Electron, Advantest, Fanuc, Yaskawa, ABB and the large diversified miners are not in the captured data — most report outside US dollars, and a layer is a sum — so their layers are read without them.'],
            ['Weights are unvalidated.', `Every band and weight was set by hand before the backtest. Engine version ${DEMAND_CALC_VERSION} is printed with every score.`],
          ].map(([h, t]) => <li key={h} className="grid gap-0.5"><strong className="text-13">{h}</strong><span className="text-13 leading-relaxed text-muted-foreground">{t}</span></li>)}
        </ul>
      </Panel>
    </div>
  );
}
