/* ==========================================================================
   Maz Vantage — Demand Discovery: the engine

   One function, `analyseChain`, turns a curated chain, the companies' filed
   quarters, the evidence register and a date into the structured result the
   spec's first deliverable asks for (§45): demand, acceleration, supply
   constraint and confidence for the theme; every layer read as a cohort;
   every company scored; every number traceable.

   It is pure and date-driven. The page calls it with today's date; the
   backtest calls it with dates in the past and gets exactly the answer a
   reader would have had then, because every input passes through
   `pointInTime` and every evidence row is filtered on its publication date.

   ---------------------------------------------------------------------------
   The narrative is assembled, not written
   ---------------------------------------------------------------------------

   The spec asks for "a concise AI-generated investment thesis" and bear
   case. No model is wired into this app, and the spec's own rule is that
   every factual claim must trace to a structured signal. So the thesis and
   bear bullets are picked from readings and evidence rows — the strongest
   positive tests for the thesis, the firing glut tests, the priced-in gate,
   inferred exposure and counter-evidence for the bear case — and each
   bullet is that reading's own sentence. When a model is wired in later,
   these bullets are its input and its guard.
   ========================================================================== */

import { isNum, mean } from './format';
import { closeOn, daysBetween, pointInTime, type Company, type DemandCapture } from './demand-data';
import { growthProfile } from './demand-metrics';
import { cyclePhase, glutWarning, PHASES, shortageSignature, type GlutWarning, type Phase, type ShortageSignature } from './demand-cycle';
import { readCohort, type CohortReading } from './demand-cohort';
import { CHAINS, EXPOSURE_SCORE, type Chain, type ChainLayer, type ChainMember } from './demand-chains';
import { pricedIn, PRICED_IN_LEVELS, type PricedIn } from './demand-pricedin';
import { band, evidenceConfidence, type Confidence, type Evidence, type EvidenceRegister, type Reading, type Source } from './demand-signals';
import {
  CONFIDENCE_SCORE, DEMAND_CALC_VERSION, financialQuality, opportunityConfidence, opportunityScore, type Opportunity,
} from './demand-score';
import type { LanguageReading } from './demand-language';

export interface LanguageEntry {
  symbol: string;
  period: string;
  date: string;
  reading: LanguageReading;
}

export interface CompanyResult {
  symbol: string;
  name: string;
  chain: string;
  layer: string;
  layerName: string;
  member: ChainMember;
  asOf: string;
  latestQuarter: string | null;
  latestFiled: string | null;
  daysSinceFiling: number | null;
  price: { date: string; close: number } | null;
  growth: { recent: number | null; base: number | null; acceleration: number | null; ttm: number | null };
  shortage: ShortageSignature;
  glut: GlutWarning;
  phase: Phase;
  quality: { score: number | null; coverage: number; readings: Reading[] };
  pricedIn: PricedIn;
  demand: number | null;
  supply: number | null;
  opportunity: Opportunity;
  confidence: { level: Confidence; reasons: string[] };
  language: LanguageEntry | null;
  thesis: string[];
  bear: string[];
}

export interface LayerResult {
  layer: ChainLayer;
  cohort: CohortReading;
  supplyScore: number | null;
  leadTimeScore: number | null;
  evidence: Evidence[];
  evidenceConfidence: ReturnType<typeof evidenceConfidence>;
  /** upstream layers that have inflected while this one has not caught up */
  upstream: { from: string; fromName: string; lag: [number, number]; why: string; fromAcceleration: number; thisAcceleration: number | null }[];
  reference: Evidence | null;
}

export interface ChainResult {
  theme: string;
  name: string;
  kind: Chain['kind'];
  question: string;
  asOf: string;
  calcVersion: string;
  demand_score: number | null;
  acceleration_score: number | null;
  supply_constraint_score: number | null;
  confidence: Confidence;
  confidence_score: number;
  layers: LayerResult[];
  companies: CompanyResult[];
  signals: Evidence[];
  supply_chain: Chain['edges'];
  sources: Source[];
  commodity: { symbol: string; label: string; price: number | null; change1y: number | null; change3y: number | null } | null;
  thesis: string[];
  bear: string[];
}

const pct = (v: number | null | undefined, dp = 0) => (isNum(v) ? `${(v * 100).toFixed(dp)}%` : 'n/a');
const pts = (v: number | null | undefined) => (isNum(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)} pts` : 'n/a');

function priceChange(prices: [string, number][], asOf: string, days: number): number | null {
  const now = closeOn(prices, asOf);
  if (!now) return null;
  const then = closeOn(prices, new Date(Date.parse(`${asOf}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10));
  return then && then.close > 0 ? now.close / then.close - 1 : null;
}

/**
 * How much of each member's reported figures belong to this layer: its
 * disclosed or estimated share, else the exposure ladder's fraction. An
 * `indirect` member weighs nothing — Teradyne's total revenue moved on
 * semiconductor test, and letting it into the robotics cohort at any weight
 * would credit robots with AI's growth. It is still scored as a company.
 */
export function cohortWeights(layer: ChainLayer): Record<string, number> {
  return Object.fromEntries(layer.members.map((m) => [
    m.symbol, m.exposure === 'indirect' ? 0 : (m.share ?? EXPOSURE_SCORE[m.exposure] / 100),
  ]));
}

function readLayer(chain: Chain, layer: ChainLayer, view: Map<string, Company>, register: EvidenceRegister, asOf: string): LayerResult {
  const comps = layer.members.map((m) => view.get(m.symbol)).filter(Boolean) as Company[];
  const cohort = readCohort(layer.id, layer.name, comps, layer.metric, cohortWeights(layer));
  const [a, b] = layer.leadTime.years;
  const leadTimeScore = band((a + b) / 2, 0.25, 12);
  const parts: [number | null, number][] = [[cohort.shortage, 0.6], [leadTimeScore, 0.4]];
  const have = parts.filter(([v]) => isNum(v)) as [number, number][];
  const w = have.reduce((s, [, k]) => s + k, 0);
  const supplyScore = have.length ? Math.round((have.reduce((s, [v, k]) => s + v * k, 0) / w) * 10) / 10 : null;
  const evidence = register.evidence.filter((e) => e.theme === chain.evidenceTheme && e.published <= asOf && (!e.layer || e.layer === layer.id));
  const reference = layer.referenceGrowth
    ? register.evidence.find((e) => e.id === layer.referenceGrowth && e.published <= asOf) ?? null
    : null;
  return {
    layer, cohort, supplyScore, leadTimeScore, evidence,
    evidenceConfidence: evidenceConfidence(evidence, register.sources, asOf),
    upstream: [], reference,
  };
}

function thesisAndBear(r: Omit<CompanyResult, 'thesis' | 'bear'>, layer: LayerResult): { thesis: string[]; bear: string[] } {
  const thesis: string[] = [];
  const bear: string[] = [];
  const strong = r.shortage.readings.filter((x) => x.status === 'positive').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const x of strong.slice(0, 3)) thesis.push(`${x.label}: ${x.detail}`);
  for (const u of layer.upstream) {
    thesis.push(`Upstream inflection: ${u.fromName} is accelerating (${pts(u.fromAcceleration)}) and is expected to reach this layer in ${u.lag[0]}–${u.lag[1]} quarters; this layer's own acceleration is ${pts(u.thisAcceleration)}.`);
  }
  const support = layer.evidence.filter((e) => e.direction > 0).sort((a, b) => b.published.localeCompare(a.published));
  if (support[0]) thesis.push(`${support[0].type === 'FORECAST' ? 'Forecast' : 'Published'}: ${support[0].claim}`);
  if (r.member.exposure === 'core' && r.member.basis === 'ACTUAL') thesis.push(`Exposure is core and disclosed: ${r.member.evidence}`);

  const firing = r.glut.readings.filter((x) => x.status === 'negative').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const x of firing.slice(0, 3)) bear.push(`${x.label}: ${x.detail}`);
  if (r.pricedIn.level === 'aggressive' || r.pricedIn.level === 'extreme') bear.push(`${PRICED_IN_LEVELS[r.pricedIn.level].label}: ${r.pricedIn.detail}`);
  const weak = r.shortage.readings.filter((x) => x.status === 'negative');
  for (const x of weak.slice(0, 2)) bear.push(`${x.label}: ${x.detail}`);
  if (r.member.basis !== 'ACTUAL' || r.member.exposure === 'indirect') bear.push(`Exposure is ${r.member.exposure} and ${r.member.basis.toLowerCase()}: ${r.member.evidence}`);
  const against = layer.evidence.filter((e) => e.direction < 0).sort((a, b) => b.published.localeCompare(a.published));
  if (against[0]) bear.push(`Counter-evidence: ${against[0].claim}`);
  if (r.language && r.language.reading.score !== null && r.language.reading.score >= 50 && r.glut.level !== 'low') {
    bear.push(`Management language is ${r.language.reading.category} (${r.language.reading.score}) while the glut tests read ${r.glut.level} — the combination seen at the 2023 lithium peak.`);
  }
  return { thesis, bear };
}

function analyseMember(
  member: ChainMember, chain: Chain, layerRes: LayerResult, view: Map<string, Company>, asOf: string, language: LanguageEntry[],
): CompanyResult | null {
  const c = view.get(member.symbol);
  if (!c || !c.quarters.length) return null;
  const qs = c.quarters;
  const last = qs[qs.length - 1];
  const g = growthProfile(qs);
  const shortage = shortageSignature(qs);
  const glut = glutWarning(qs);
  const phase = cyclePhase(shortage, glut, qs);
  const quality = financialQuality(qs);
  const price = closeOn(c.prices, asOf);
  const shares = [...qs].reverse().find((q) => isNum(q.sh))?.sh ?? null;
  const pi = pricedIn(qs, price?.close ?? null, shares, layerRes.reference?.value ?? null);
  const demandParts = [band(g.recent, -0.1, 0.4), band(g.acceleration, -0.15, 0.15), layerRes.cohort.demandScore].filter(isNum) as number[];
  const demand = demandParts.length >= 2 ? Math.round(mean(demandParts)! * 10) / 10 : null;
  const supplyParts = [shortage.score, layerRes.supplyScore].filter(isNum) as number[];
  const supply = supplyParts.length ? Math.round(mean(supplyParts)! * 10) / 10 : null;
  const opportunity = opportunityScore({
    demand, supply, exposure: EXPOSURE_SCORE[member.exposure], quality: quality.score, pricedIn: pi, glut: glut.level,
  });
  const daysSinceFiling = daysBetween(last.filed, asOf);
  const confidence = opportunityConfidence({
    coverage: opportunity.coverage,
    shortageCoverage: shortage.coverage,
    evidence: layerRes.evidenceConfidence.level,
    daysSinceFiling,
    exposureBasis: member.basis,
    pricedInKnown: pi.level !== 'unknown',
  });
  const lang = language.filter((l) => l.symbol === member.symbol && l.date <= asOf).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const partial: Omit<CompanyResult, 'thesis' | 'bear'> = {
    symbol: c.symbol, name: c.name, chain: chain.id, layer: layerRes.layer.id, layerName: layerRes.layer.name, member, asOf,
    latestQuarter: last.date, latestFiled: last.filed, daysSinceFiling, price,
    growth: { recent: g.recent, base: g.base, acceleration: g.acceleration, ttm: g.ttmGrowth },
    shortage, glut, phase, quality, pricedIn: pi, demand, supply, opportunity, confidence, language: lang,
  };
  return { ...partial, ...thesisAndBear(partial, layerRes) };
}

export interface EngineInputs {
  capture: DemandCapture;
  register: EvidenceRegister;
  asOf: string;
  language?: LanguageEntry[];
}

export function analyseChain(chain: Chain, { capture, register, asOf, language = [] }: EngineInputs): ChainResult {
  const view = new Map<string, Company>();
  for (const l of chain.layers) for (const m of l.members) {
    const c = capture.companies[m.symbol];
    if (c && !view.has(m.symbol)) view.set(m.symbol, pointInTime(c, asOf));
  }
  const layers = chain.layers.map((l) => readLayer(chain, l, view, register, asOf));
  const byId = new Map(layers.map((l) => [l.layer.id, l]));
  for (const e of chain.edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;
    const fa = from.cohort.acceleration;
    const ta = to.cohort.acceleration;
    if (isNum(fa) && fa > 0.05 && (from.cohort.demandScore ?? 0) >= 55 && (!isNum(ta) || ta < fa - 0.05)) {
      to.upstream.push({ from: e.from, fromName: from.layer.name, lag: e.lagQuarters, why: e.why, fromAcceleration: fa, thisAcceleration: ta });
    }
  }

  const companies: CompanyResult[] = [];
  for (const lr of layers) {
    if (lr.layer.metric !== 'rev') continue;
    for (const m of lr.layer.members) {
      const r = analyseMember(m, chain, lr, view, asOf, language);
      if (r) companies.push(r);
    }
  }
  companies.sort((a, b) => (b.opportunity.score ?? -1) - (a.opportunity.score ?? -1));

  const ds = layers.map((l) => l.cohort.demandScore).filter(isNum) as number[];
  const as = layers.map((l) => band(l.cohort.acceleration, -0.15, 0.15)).filter(isNum) as number[];
  const ss = layers.map((l) => l.supplyScore).filter(isNum) as number[];
  const signals = register.evidence.filter((e) => e.theme === chain.evidenceTheme && e.published <= asOf);
  const conf = evidenceConfidence(signals, register.sources, asOf).level;
  const used = new Set(signals.flatMap((e) => [e.sourceId, e.origin].filter(Boolean) as string[]));

  let commodity: ChainResult['commodity'] = null;
  if (chain.commodity) {
    const b = capture.benchmarks[chain.commodity.symbol];
    const px = b ? b.prices.filter((p) => p[0] <= asOf) : [];
    commodity = {
      symbol: chain.commodity.symbol, label: chain.commodity.label,
      price: px.length ? px[px.length - 1][1] : null,
      change1y: px.length ? priceChange(px, asOf, 365) : null,
      change3y: px.length ? priceChange(px, asOf, 365 * 3) : null,
    };
  }

  const thesis: string[] = [];
  const bear: string[] = [];
  const rank = [...layers].filter((l) => isNum(l.cohort.demandScore)).sort((a, b) => b.cohort.demandScore! - a.cohort.demandScore!);
  for (const l of rank.slice(0, 2)) {
    thesis.push(`${l.layer.name}: ${l.cohort.metric === 'capex' ? 'capital spending' : 'revenue'} up ${pct(l.cohort.recentGrowth)} a year in the two newest quarters (${pts(l.cohort.acceleration)} against the four before), ${isNum(l.cohort.breadth) ? `${Math.round(l.cohort.breadth * 100)}% of members accelerating` : 'breadth not measurable'}.`);
  }
  for (const l of layers) for (const u of l.upstream) thesis.push(`${l.layer.name} has not caught up with ${u.fromName} yet (expected lag ${u.lag[0]}–${u.lag[1]} quarters).`);
  const topFc = signals.filter((e) => e.direction > 0 && e.type === 'FORECAST').sort((a, b) => b.published.localeCompare(a.published))[0];
  if (topFc) thesis.push(`Forecast: ${topFc.claim}`);
  if (commodity && isNum(commodity.change1y)) thesis.push(`${commodity.label} ${pct(commodity.change1y)} over a year, ${pct(commodity.change3y)} over three.`);
  for (const l of layers) if (isNum(l.cohort.glutRisk) && l.cohort.glutRisk >= 45) bear.push(`${l.layer.name}: mean glut risk ${Math.round(l.cohort.glutRisk)}/100 across members.`);
  for (const e of signals.filter((x) => x.direction < 0).sort((a, b) => b.published.localeCompare(a.published)).slice(0, 2)) bear.push(`Counter-evidence: ${e.claim}`);
  const priced = companies.filter((c) => c.pricedIn.level === 'aggressive' || c.pricedIn.level === 'extreme').map((c) => c.symbol);
  if (priced.length) bear.push(`Priced in or beyond the evidence: ${priced.join(', ')}.`);
  const uncaptured = chain.layers.flatMap((l) => l.uncaptured || []);
  if (uncaptured.length) bear.push(`Not measured here: ${uncaptured.join(', ')} — part of the supply side the scores cannot see.`);

  return {
    theme: chain.id, name: chain.name, kind: chain.kind, question: chain.question, asOf, calcVersion: DEMAND_CALC_VERSION,
    demand_score: ds.length ? Math.round(mean(ds)! * 10) / 10 : null,
    acceleration_score: as.length ? Math.round(mean(as)! * 10) / 10 : null,
    supply_constraint_score: ss.length ? Math.round(mean(ss)! * 10) / 10 : null,
    confidence: conf,
    confidence_score: CONFIDENCE_SCORE[conf],
    layers, companies, signals,
    supply_chain: chain.edges,
    sources: register.sources.filter((s) => used.has(s.id)),
    commodity, thesis, bear,
  };
}

export function analyseAll(inputs: EngineInputs, chains: Chain[] = CHAINS): ChainResult[] {
  return chains.map((c) => analyseChain(c, inputs));
}

export { PHASES };
