/* ==========================================================================
   Maz Vantage — the research narrative

   The long-form prose on the Research tab: where it comes from, and the seam
   a developer wires a live language model into.

   ---------------------------------------------------------------------------
   How it works today
   ---------------------------------------------------------------------------

   Narratives are pre-generated and shipped as data, in
   `assets/data/research.json`, keyed by symbol. This mirrors
   `assets/data/summaries.json`, which does the same job for earnings calls —
   one small file, fetched once, and a company with no entry falls back to the
   short deterministic prose that `research.js` assembles from the numbers.

   **Only AAPL ships a narrative.** It is there as the reference the format is
   defined by: run any other ticker and the tab still works, on the generated
   short-form, and says which of the two it is showing.

   ---------------------------------------------------------------------------
   How a developer makes it live
   ---------------------------------------------------------------------------

   `buildBrief(a)` reduces the whole analysis to the ~90 figures the prose
   actually cites. `buildPrompt(a)` wraps that brief in the instruction text
   and returns `{ system, user, schema }` — everything needed for one call to
   any chat-completions API. Neither function touches the network.

   `fetchNarrative(a)` is the seam. It resolves in this order:

     1. a configured endpoint (`localStorage['mazvantage.narrative.endpoint']`),
        which is POSTed `buildPrompt(a)` as JSON and must answer with an object
        matching `NARRATIVE_SCHEMA`;
     2. the bundled `research.json`;
     3. null, and the caller falls back to generated prose.

   The endpoint has to be **your** service, not the model vendor directly: a
   browser cannot hold an API key, and this app has no backend. Put the key on
   the server, have it call the model, and return the JSON. That server is the
   only new moving part — everything on this side is already written.

   ---------------------------------------------------------------------------
   The one rule the prompt enforces
   ---------------------------------------------------------------------------

   **The model is given numbers and asked to write prose. It is never asked
   for a number.** Every figure in the brief is pre-computed here, already
   formatted, and the instructions tell the model to quote them verbatim and
   invent nothing. A language model asked to reason about a P/E will sometimes
   produce a different P/E, and a research report whose numbers drift from the
   tables beside them is worse than one with no prose at all.

   The rendered narrative is checked against that on the way in: `validate()`
   drops any section that is not the expected shape, so a malformed or
   truncated model response degrades to the generated prose for that section
   rather than rendering as an empty card.
   ========================================================================== */

import { isNum, money, num, pct, mult, price, dec, fmtDate } from './util.js';
import { curSymbol } from './ui.js';

const NARRATIVE_URL = 'assets/data/research.json';
const ENDPOINT_KEY = 'mazvantage.narrative.endpoint';

/* ==========================================================================
   The shape a narrative must have
   ========================================================================== */

/**
 * What a generated narrative has to contain to be rendered.
 *
 * `note` is an object; every other section is an array of paragraphs. The
 * counts are the minimum a section needs to be worth showing — a one-sentence
 * "Business Strategy & Outlook" is worse than the generated one it would
 * replace, so it is rejected rather than rendered.
 */
export const NARRATIVE_SCHEMA = {
  note: { headline: 'string', why: 'string[3-4]', bottomLine: 'string' },
  strategy: 'string[4+]',
  bulls: 'string[3]',
  bears: 'string[3]',
  moat: 'string[4+]',
  fairValue: 'string[4+]',
  risk: 'string[4+]',
  capital: 'string[4+]',
};

const MIN_PARAS = { strategy: 4, moat: 4, fairValue: 4, risk: 4, capital: 4, bulls: 3, bears: 3 };

const isProse = (s) => typeof s === 'string' && s.trim().length > 40;

/**
 * Keep what is well-formed, drop what is not.
 *
 * Section by section rather than all-or-nothing: a model that returns four
 * good sections and one truncated one should give the reader four good
 * sections, with the fifth falling back to generated prose.
 */
export function validate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};

  const n = raw.note;
  if (n && typeof n.headline === 'string' && n.headline.trim()
      && Array.isArray(n.why) && n.why.filter(isProse).length >= 2
      && isProse(n.bottomLine)) {
    out.note = {
      headline: n.headline.trim(),
      why: n.why.filter(isProse).slice(0, 4),
      bottomLine: n.bottomLine.trim(),
    };
  }

  for (const [key, min] of Object.entries(MIN_PARAS)) {
    const v = raw[key];
    if (Array.isArray(v)) {
      const paras = v.filter(isProse);
      if (paras.length >= min) out[key] = paras;
    }
  }

  return Object.keys(out).length ? out : null;
}

/* ==========================================================================
   Loading
   ========================================================================== */

let filePromise = null;

/** The bundled narratives, fetched once per session. */
function loadFile() {
  filePromise ??= fetch(NARRATIVE_URL, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return filePromise;
}

/** The configured narrative service, if a developer has pointed at one. */
export function narrativeEndpoint() {
  try { return localStorage.getItem(ENDPOINT_KEY) || ''; } catch { return ''; }
}

export function setNarrativeEndpoint(url) {
  try {
    if (url) localStorage.setItem(ENDPOINT_KEY, url.trim());
    else localStorage.removeItem(ENDPOINT_KEY);
  } catch { /* private browsing — the bundled file still works */ }
}

/**
 * The narrative for this company, or null.
 *
 * Returns `{ sections, source, model, generatedAt, basis }`. `source` is
 * 'live' or 'bundled', and the byline prints it — a reader is entitled to
 * know whether the prose came from a model just now or from a file written
 * weeks ago against figures that have since moved.
 */
export async function fetchNarrative(a, ratings) {
  const symbol = a.facts.symbol;

  const endpoint = narrativeEndpoint();
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        // `ratings` is not optional on this path. Without it the brief goes
        // out with no quant rating, no fair value and no moat — the model
        // would be asked to explain ratings it had not been given, which is
        // exactly the situation the prompt's rules cannot save it from.
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPrompt(a, ratings)),
      });
      if (res.ok) {
        const json = await res.json();
        const sections = validate(json.sections || json);
        if (sections) {
          return {
            sections, source: 'live',
            model: json.model || 'the configured service',
            generatedAt: json.generatedAt || new Date().toISOString(),
            basis: null,
          };
        }
      }
    } catch { /* fall through to the bundled file */ }
  }

  const file = await loadFile();
  const entry = file?.[symbol];
  const sections = validate(entry?.sections);
  if (!sections) return null;

  return {
    sections,
    source: 'bundled',
    model: entry.model || 'a language model',
    generatedAt: entry.generatedAt || null,
    basis: entry.basis || null,
  };
}

/* ==========================================================================
   The brief

   Everything the prose is allowed to cite, pre-computed and pre-formatted.
   The model gets this and nothing else.
   ========================================================================== */

const f1 = (v, fmt) => (isNum(v) ? fmt(v) : null);

/**
 * The analysis reduced to the figures the narrative cites.
 *
 * Formatted strings rather than raw numbers, deliberately. A model handed
 * `0.27618604910212224` will round it five different ways across five
 * paragraphs; handed `"27.6%"` it will quote `"27.6%"`. The tables on the page
 * are rendered from the same helpers, so the prose and the tables agree by
 * construction rather than by luck.
 */
export function buildBrief(a, ratings) {
  const F = a.facts;
  const cur = curSymbol(F.currency);
  const m$ = (v) => f1(v, (x) => money(x, { currency: cur }));
  const p$ = (v) => f1(v, (x) => price(x, cur));
  const pc = (v) => f1(v, (x) => pct(x));
  const mx = (v) => f1(v, (x) => mult(x));

  const rows = a.series.rows || [];
  const first = rows[0], last = rows.at(-1);
  const seg = a.segments?.product?.latest;
  const geo = a.segments?.geography?.latest;

  return {
    company: {
      name: F.name, symbol: F.symbol, exchange: F.exchange,
      sector: F.sector, industry: F.industry, country: F.country, ceo: F.ceo,
      employees: f1(F.employees, (v) => num(v, 0)),
      description: F.description || null,
      currency: F.currency,
      asOf: fmtDate(a.ds.asOf),
      dataSource: a.ds.source === 'snapshot' ? 'a bundled snapshot' : 'live Financial Modeling Prep data',
    },

    market: {
      price: p$(F.price), marketCap: m$(F.marketCap),
      peTrailing: mx(F.pe), peForward: mx(a.val?.peFwd),
      evToEbitda: mx(a.val?.evToEbitda), priceToBook: mx(F.priceToBook),
      fcfYield: pc(a.val?.fcfYield), dividendYield: pc(F.dividendYield),
      buybackYield: pc(a.val?.buybackYield), shareholderYield: pc(a.val?.shareholderYield),
      beta: f1(F.beta, (v) => dec(v, 2)),
      return1y: pc(a.momentum?.r1y), return3m: pc(a.momentum?.r3m),
      excessVsSector: pc(a.momentum?.excessSector),
      maxDrawdown1y: pc(a.momentum?.drawdown),
      analystTarget: p$(a.momentum?.targetPrice),
      analystUpside: pc(a.momentum?.targetUpside),
      costOfEquity: pc(a.momentum?.costOfEquity),
    },

    trailing: {
      revenue: m$(F.revenue), netIncome: m$(F.netIncome), eps: p$(F.eps),
      grossMargin: pc(F.grossMargin), operatingMargin: pc(F.operatingMargin),
      netMargin: pc(F.netMargin),
      roe: pc(F.roe), roic: pc(F.roic), roa: pc(F.roa), roce: pc(F.roce),
      cash: m$(F.cash), totalDebt: m$(F.totalDebt),
      netDebtToEbitda: mx(F.netDebtToEbitda),
      currentRatio: f1(F.currentRatio, (v) => dec(v, 2)),
      debtToEquity: f1(F.debtToEquity, (v) => dec(v, 2)),
      altmanZ: f1(F.altmanZ, (v) => dec(v, 2)),
      piotroski: isNum(F.piotroski) ? `${F.piotroski} of 9` : null,
      payoutRatio: pc(F.payoutRatio),
    },

    /* The filed run, as compact rows. The prose leans on this for anything
       about direction — a margin that widened, a share count that fell. */
    history: rows.map((r) => ({
      year: r.year,
      revenue: m$(r.revenue), netIncome: m$(r.netIncome), eps: p$(r.eps),
      grossMargin: pc(r.grossMargin), operatingMargin: pc(r.operatingMargin),
      roic: pc(r.roic), wacc: pc(r.wacc), spread: pc(r.spread),
      freeCashFlow: m$(r.fcf), buybacks: m$(r.buybacks), dividends: m$(r.dividends),
      rAndD: m$(r.rnd),
      dilutedShares: f1(r.shares, (v) => num(v, 0)),
    })),

    historyNotes: {
      span: rows.length ? `${first.year}–${last.year}` : null,
      shareCountChange: (isNum(first?.shares) && isNum(last?.shares) && first.shares > 0)
        ? pct(last.shares / first.shares - 1, { sign: true }) : null,
      grossMarginMove: (first && last) ? `${pct(first.grossMargin)} to ${pct(last.grossMargin)}` : null,
      operatingMarginMove: (first && last) ? `${pct(first.operatingMargin)} to ${pct(last.operatingMargin)}` : null,
    },

    forecast: {
      analysts: a.forecast?.analystCount || null,
      revenueCagr: pc(a.forecast?.revenueGrowth),
      epsCagr: pc(a.forecast?.epsGrowth),
      earningsCagr: pc(a.forecast?.earningsGrowth),
      forecastRoe: pc(a.forecast?.futureRoe),
      fromYear: a.forecast?.base?.year ?? null,
      toYear: a.forecast?.target?.year ?? null,
      rows: (a.forecast?.rows || []).map((r) => ({
        year: r.year, revenue: m$(r.revenue), eps: p$(r.eps), netIncome: m$(r.netIncome),
      })),
    },

    lastQuarter: a.quarter?.available ? {
      date: fmtDate(a.quarter.date),
      eps: p$(a.quarter.eps), epsEstimate: p$(a.quarter.epsEstimate),
      epsSurprise: pc(a.quarter.epsSurprise),
      revenue: m$(a.quarter.revenue), revenueEstimate: m$(a.quarter.revenueEstimate),
      revenueSurprise: pc(a.quarter.revenueSurprise),
      nextReport: a.quarter.next ? fmtDate(a.quarter.next) : null,
      beatRate: pc(a.surprises?.beatRate),
      quartersScored: a.surprises?.scored ?? null,
    } : null,

    segments: {
      product: seg?.parts?.map((p) => ({ name: p.name, share: pct(p.value / seg.total), value: m$(p.value) })) || [],
      geography: geo?.parts?.map((p) => ({ name: p.name, share: pct(p.value / geo.total) })) || [],
    },

    /* The quant rating, which is the headline rating on the page and the
       thing the prose has to be consistent with. */
    quant: ratings?.quant ? {
      verdict: ratings.quant.verdict,
      letter: ratings.quant.letter,
      score: `${dec(ratings.quant.score, 2)} out of 5`,
      gradedRatios: ratings.quant.graded,
      factors: ratings.quant.factors.map((x) => ({
        factor: x.title, letter: x.letter,
        score: f1(x.score, (v) => dec(v, 2)),
        ratios: `${x.graded} of ${x.total}`,
      })),
      strongest: ratings.quant.strongest?.title || null,
      weakest: ratings.quant.weakest?.title || null,
    } : null,

    valuation: ratings?.fve ? {
      fairValue: p$(ratings.fve.value),
      modelCount: ratings.fve.count,
      rangeLow: p$(ratings.fve.low), rangeHigh: p$(ratings.fve.high),
      middleHalf: (ratings.fve.q1 && ratings.fve.q3)
        ? `${price(ratings.fve.q1, cur)} to ${price(ratings.fve.q3, cur)}` : null,
      priceToFairValue: f1(ratings.zone?.ratio, (v) => dec(v, 2)),
      zone: ratings.zone?.label || null,
      undervaluedBelow: p$(ratings.zone?.low),
      overvaluedAbove: p$(ratings.zone?.high),
      models: (ratings.fve.models || []).map((x) => ({
        model: x.full || x.label, family: x.family === 'dcf' ? 'DCF' : 'multiple', value: p$(x.value),
      })),
    } : null,

    uncertainty: ratings?.unc ? {
      rating: ratings.unc.label,
      driversMeasured: `${ratings.unc.measured} of ${ratings.unc.of}`,
      drivers: ratings.unc.drivers.map((d) => ({
        driver: d.label,
        reading: isNum(d.value) ? d.fmt(d.value) : 'not measured',
        contribution: d.points === 0 ? 'contained' : d.points === 1 ? 'moderate' : d.points === 2 ? 'wide' : 'not measured',
      })),
    } : null,

    moat: ratings?.moat ? {
      rating: ratings.moat.label,
      yearsMeasured: ratings.moat.years,
      yearsAboveCostOfCapital: ratings.moat.positive,
      averageSpread: pc(ratings.moat.avgSpread),
      latestSpread: pc(ratings.moat.nowSpread),
      grossMargin: pc(ratings.moat.gmNow),
      grossMarginStdDev: pc(ratings.moat.gmSd),
    } : null,

    capitalAllocation: ratings?.capital ? {
      rating: ratings.capital.label,
      legs: ratings.capital.legs.map((l) => ({ leg: l.label, assessment: l.verdict, evidence: l.detail || null })),
    } : null,

    style: ratings?.style ? { box: ratings.style.label } : null,

    /* The ratios that rank furthest from the sector median, with the
       sentence the report already prints for each. These are the raw
       material for Bulls Say / Bears Say. */
    strongestRatios: (a.rewards || []).slice(0, 5),
    weakestRatios: (a.risks || []).slice(0, 5),

    caveats: [
      a.sectorTable?.quality === 'seed'
        ? 'The sector distributions behind every letter grade are modelled rather than measured, so the quant rating and the ranked ratios carry that caveat.'
        : null,
      'Every financial statement here is annual, not quarterly, so year-on-year lines compare full fiscal years.',
      'Analyst estimates are used exactly as the vendor supplies them and are not smoothed; the outer years of any consensus thin out as coverage does, and can move in ways the business will not.',
      'No fair value on this page feeds the quant rating. The two are computed separately and routinely disagree.',
    ].filter(Boolean),
  };
}

/* ==========================================================================
   The prompt
   ========================================================================== */

const SYSTEM = `You are an equity research analyst writing for Maz Vantage, a stock research \
platform. You write in the register of a Morningstar equity analyst report: measured, \
declarative, first person plural ("we assign", "we expect", "in our view"), specific, and \
willing to state an unwelcome conclusion plainly.

ABSOLUTE RULES

1. Every number you write must appear verbatim in the BRIEF you are given. Copy figures \
exactly as they are formatted there. Do not compute, re-derive, round, convert or estimate \
any number. If a figure you want is not in the brief, write the sentence without it or omit \
the sentence.
2. Do not invent facts about the company that are not in the brief: no product launches, no \
executive quotes, no competitor moves, no regulatory events, no dates, no market share \
figures. The brief is the whole of the evidence.
3. The ratings in the brief are given. Explain and justify them from the evidence; never \
contradict them, and never assign a different rating.
4. Attribute forecasts to the analyst consensus, not to yourself. You did not build a model.
5. State the limitations named in the brief's "caveats" where they bear on what you are \
saying. A research report that hides the weakness of its own inputs is worse than a short one.
6. No investment advice, no price predictions of your own, no "buy"/"sell" instruction to \
the reader beyond reporting the quant verdict the brief supplies.

STYLE

Paragraphs of 60-110 words. No bullet points inside a paragraph, no headings, no markdown, \
no bold. Vary sentence length. Prefer the concrete noun to the abstract one. Do not open \
consecutive paragraphs with the same word. Do not use the words "delve", "leverage" as a \
verb, "robust", or "landscape". Write "the company" or the short form of its name, not the \
ticker, in prose.`;

const TASK = `Write the narrative sections of an equity research report on the company in the \
BRIEF. Return ONLY a JSON object, no prose outside it, in exactly this shape:

{
  "note": {
    "headline": "One line, title case, naming the company and the single most important \
thing in the brief. Under 110 characters.",
    "why": ["3 or 4 sentences, each a standalone point, each carrying a figure from the brief"],
    "bottomLine": "2-4 sentences: the quant rating, what the price is doing against fair \
value, and what would change the view."
  },
  "strategy": ["4-6 paragraphs: what the business is, where the revenue comes from by \
segment and geography, how margins and returns have moved across the filed run, and what \
the consensus expects next."],
  "bulls": ["exactly 3 sentences, each one specific strength with its figure"],
  "bears": ["exactly 3 sentences, each one specific weakness with its figure"],
  "moat": ["4-6 paragraphs on the moat rating: the return-on-capital record against its \
cost, what in the business plausibly explains it, what would erode it, and the stated limit \
that this is a measurement of the past rather than a forecast."],
  "fairValue": ["4-6 paragraphs on the fair value estimate: what the models say, how far \
apart they are, what the price implies, and which assumptions the estimate is most \
sensitive to."],
  "risk": ["4-6 paragraphs on the uncertainty rating: what drives it, what is concentrated \
or geared, and what kind of risk this method cannot see."],
  "capital": ["4-6 paragraphs on capital allocation: the balance sheet, what reinvestment \
has earned, and what has been returned to shareholders and how it was funded."]
}`;

/**
 * The complete request, ready to POST to a narrative service.
 *
 * Returned rather than sent: this file makes no network call to a model, and
 * the browser has nowhere safe to keep a key. A developer's service receives
 * this object, forwards `system` and `user` to whichever model it uses, and
 * returns the parsed JSON.
 */
export function buildPrompt(a, ratings) {
  const brief = buildBrief(a, ratings);
  return {
    symbol: a.facts.symbol,
    schema: NARRATIVE_SCHEMA,
    system: SYSTEM,
    user: `${TASK}\n\nBRIEF:\n${JSON.stringify(brief, null, 2)}`,
    brief,
  };
}
