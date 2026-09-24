/* ==========================================================================
   Vanlior — Investment Ideas

   A page of themed screens. Each idea is a thesis, a set of rules, and the
   companies that currently pass them.

   This is the only surface in the app that is not about one company, and that
   changes what it can afford. A full report costs 27 feeds per company; a
   twenty-name list built that way would be 540 requests. So an idea runs a
   deliberately cheaper pipeline, and the honesty of the page rests on saying
   so plainly at every step:

     1. **FMP screens server-side** on size, sector and country — roughly all
        its screener understands, and none of it about ratios. One call, asking
        for as many rows as the vendor will return. That is the *universe*.
     2. **The universe is deduplicated**, so a company appears once. A second
        listing of the same shares (`NVDA.NE`) and a second share class (`GOOG`
        beside `GOOGL`) are the same investment, and either would take a slot
        from a company not already in the set.
     3. **Candidates are capped by a request budget**, not by a fixed number.
        An idea needing only trailing ratios tests three hundred companies; one
        needing price history as well tests a hundred and fifty. Either way it
        spends about `REQUEST_BUDGET` requests, and anything past the cap is
        never tested — so a result is the best of a sample rather than the best
        of the market. Every idea says so under its table.
     4. **Two to four feeds per candidate** fill the rules. Ratio rules run in
        the browser because the vendor's screener cannot express them, and
        factor-score rules go through `scoreLite`, which grades up to `LITE_TOTAL`
        metrics against the company's own sector using the report's own metric
        definitions and distributions.

   The scores here are **not** the ones on a Ratings tab. Those come from 77
   ratios off a full 27-feed pull; these come from at most `LITE_TOTAL` off
   four. Same
   scale, same distributions, much thinner evidence — which is why every score
   printed here carries the count of ratios behind it.

   Nothing here is advice, and the ideas are not ranked against each other. An
   idea is a question worth asking, and the companies under it are the ones
   that currently answer it — which is a starting point for the full report,
   not a substitute for reading one.

   Runs are explicit. Opening the index costs nothing; opening one idea costs
   one screener call plus two to four requests per company tested, and the
   figure is printed on its Run button.
   ========================================================================== */

import { el, esc, isNum, money, num, pct, dec, mult } from './util.js';
import { card, notice, statLine, ohead, table, icon } from './ui.js';
import { fetchScreener, fetchFor, mapLimited } from './fmp.js';
import { loadSectorStats, sectorLookup, letterFor, MAX_SCORE } from './grading.js';
import {
  scoreLite, returnsFromPrices, dcfFromFeed, insiderFromStats, floatFromFeed,
  estimatesFromFeed, gradesFromFeed, LITE_SOURCES, LITE_DEPTH,
} from './model.js';
import { FACTOR_BY_KEY, FACTOR_KEYS } from './factors.js';
import { gradePill } from './gradeview.js';
import { IDEA_GROUPS } from './nav.js';

/**
 * Roughly how many requests one idea may spend on candidates.
 *
 * The cap is derived from this rather than fixed, so an idea needing a fourth
 * feed tests fewer companies instead of quietly costing twice as much. Raising
 * it widens every screen linearly — and linearly is also how it consumes an
 * FMP quota, which is why it is one number in one place.
 */
const REQUEST_BUDGET = 600;

/** Floor and ceiling on the derived cap, whatever the budget says. */
const MIN_CANDIDATES = 40;
const MAX_CANDIDATES = 400;

/** How many rows an idea shows once the rules have run, unless it says. */
const RESULT_CAP = 25;

/** Bag name -> the feed that fills it. */
export const BAG_FEED = {
  ratios: 'ratiosTtm',
  metrics: 'metricsTtm',
  // The company's sector, for anything that grades it: a ratio is ranked
  // against its own sector's distribution, so a score without the sector is a
  // score against the wrong table. The watchlist's Vanlior Quant column buys this
  // alongside the two ratio feeds.
  profile: 'profile',
  growth: 'growth',
  returns: 'prices',
  dcf: 'dcfLevered',
  insider: 'insiderStats',
  float: 'sharesFloat',
  estimates: 'estimates',
  // Added for the Shariah screens, which need debt and cash as separate
  // lines rather than netted — every published methodology divides each of
  // them by the same base, and a net figure cannot be split back out. One
  // more request per candidate, which is the cost of running those screens
  // at all.
  balance: 'balance',
  // The sell side's rating tally. One more request per candidate, and only the
  // screens that actually read an analyst figure pay it — `bagsFor` derives
  // the list from the rules.
  grades: 'grades',
};

/**
 * Bag name -> how to shape that feed's payload before a rule reads it.
 *
 * A bag with no entry is used exactly as the vendor sent it. The rest need
 * either picking (the newest fiscal year out of a list) or deriving (a
 * discount, a four-quarter insider total), and all of that lives in
 * `model.js` — the only file that is supposed to know a vendor field name.
 */
export const BAG_SHAPE = {
  returns: (data) => returnsFromPrices(data),
  growth: (data) => {
    // A list of fiscal years; the newest once sorted is the one to grade.
    const list = Array.isArray(data) ? data : [data];
    return list.filter(Boolean)
      .sort((x, y) => new Date(x.date) - new Date(y.date)).at(-1) || null;
  },
  dcf: (data, hit) => dcfFromFeed(Array.isArray(data) ? data[0] : data, hit?.price),
  insider: (data) => insiderFromStats(data),
  float: (data) => floatFromFeed(Array.isArray(data) ? data[0] : data),
  estimates: (data) => estimatesFromFeed(data),
  balance: (data) => {
    const list = Array.isArray(data) ? data : [data];
    return list.filter(Boolean)
      .sort((x, y) => new Date(x.date) - new Date(y.date)).at(-1) || null;
  },
  grades: (data) => gradesFromFeed(Array.isArray(data) ? data[0] : data),
};

/** Every idea shows a score, and a score needs these two. */
const BASE_BAGS = ['ratios', 'metrics'];

/** Every metric this path can grade, across all five factors. */
const LITE_TOTAL = Object.values(LITE_DEPTH).reduce((a, b) => a + b, 0);

/* ==========================================================================
   Reading a candidate

   Every rule and column below goes through these, so a vendor field name
   appears once rather than once per idea. `c` is a candidate:

     { symbol, name, sector, industry, marketCap, price, beta, r, km }

   where `r` is the `ratios-ttm` row and `km` the `key-metrics-ttm` row. Both
   can be null — a company the vendor has no ratios for still appears in the
   universe count, it just cannot pass a ratio rule.
   ========================================================================== */

function field(bag, name) {
  const get = (c) => c[bag]?.[name];
  get.bag = bag;
  return get;
}

export const F = {
  pe: field('ratios', 'priceToEarningsRatioTTM'),
  pb: field('ratios', 'priceToBookRatioTTM'),
  ps: field('ratios', 'priceToSalesRatioTTM'),
  peg: field('ratios', 'priceToEarningsGrowthRatioTTM'),
  grossMargin: field('ratios', 'grossProfitMarginTTM'),
  operatingMargin: field('ratios', 'operatingProfitMarginTTM'),
  netMargin: field('ratios', 'netProfitMarginTTM'),
  currentRatio: field('ratios', 'currentRatioTTM'),
  debtToEquity: field('ratios', 'debtToEquityRatioTTM'),
  interestCover: field('ratios', 'interestCoverageRatioTTM'),
  dividendYield: field('ratios', 'dividendYieldTTM'),
  payout: field('ratios', 'dividendPayoutRatioTTM'),
  fcfToOcf: field('ratios', 'freeCashFlowOperatingCashFlowRatioTTM'),
  assetTurnover: field('ratios', 'assetTurnoverTTM'),

  roe: field('metrics', 'returnOnEquityTTM'),
  roic: field('metrics', 'returnOnInvestedCapitalTTM'),
  fcfYield: field('metrics', 'freeCashFlowYieldTTM'),
  netDebtToEbitda: field('metrics', 'netDebtToEBITDATTM'),
  incomeQuality: field('metrics', 'incomeQualityTTM'),
  capexToRevenue: field('metrics', 'capexToRevenueTTM'),
  rdToRevenue: field('metrics', 'researchAndDevelopementToRevenueTTM'),
  evToEbitda: field('metrics', 'evToEBITDATTM'),

  revenueGrowth: field('growth', 'revenueGrowth'),
  epsGrowth: field('growth', 'epsgrowth'),
  fcfGrowth: field('growth', 'freeCashFlowGrowth'),

  /* Derived bags, shaped by the builders in model.js. */
  discount: field('dcf', 'discount'),
  fairValue: field('dcf', 'fairValue'),
  insiderNet: field('insider', 'net'),
  insiderBought: field('insider', 'acquired'),
  closelyHeld: field('float', 'closelyHeld'),
  fwdEpsGrowth: field('estimates', 'epsGrowth'),
  fwdRevenueGrowth: field('estimates', 'revenueGrowth'),
  analysts: field('estimates', 'analysts'),

  totalDebt: field('balance', 'totalDebt'),
  cashAndShortTerm: field('balance', 'cashAndShortTermInvestments'),
  totalAssets: field('balance', 'totalAssets'),

  return1y: field('returns', 'r1y'),
  return6m: field('returns', 'r6m'),
  drawdown: field('returns', 'drawdown'),

  /* The sell side's view, which is emphatically not this report's. See
     `gradesFromFeed` in model.js for why the 0-5 scale is shared and the
     meaning is not. */
  analystScore: field('grades', 'score'),
  analystCount: field('grades', 'total'),
  analystBuyShare: field('grades', 'buyShare'),
};

/* Every accessor knows its own name.
 *
 * This is what makes a rule *introspectable*: `atLeast(label, F.roic, 0.10)`
 * can record `{ metric: 'roic', op: 'gte', value: 0.10 }` beside the closure,
 * and the screener panel can then render that rule as an editable control and
 * rebuild it from the edited numbers. Stamped in a loop rather than passed to
 * `field()` so none of the definitions above had to be touched. */
for (const [key, get] of Object.entries(F)) get.key = key; 

/**
 * Fill one bag for one symbol.
 *
 * `BAG_FEED` says which feed a bag reads and `BAG_SHAPE` how to shape it. A
 * caller outside the screening engine — the market tables, for instance —
 * wants the pair applied, not the maps. Returns null on anything that did not
 * come back, which every consumer already renders as "n/a".
 */
export async function loadBag(bag, symbol, extra = {}) {
  const feed = BAG_FEED[bag];
  if (!feed) return null;
  const r = await fetchFor(feed, symbol, extra);
  if (r.status !== 'ok' || r.data == null) return null;
  const shape = BAG_SHAPE[bag];
  return shape ? shape(r.data, { symbol }) : r.data;
}

/* ---------- rules -----------------------------------------------------------

   A rule carries two descriptions of itself: the closure that tests a company,
   and — since the screener panel was built — a **`filter` descriptor** saying
   what it is testing in data rather than in code.

       { metric: 'roic', op: 'gte', value: 0.10 }

   That descriptor is what lets the portfolio page render an existing rule as a
   control, let the reader move the number, and rebuild the rule from the new
   one. It is attached by the builders below, so **none of the twenty-three
   ideas had to be rewritten** to become editable — which was the whole point
   of doing it this way round.

   `ruleFromFilter()` further down is the inverse and the only other half that
   matters: descriptor in, rule out. Anything that can round-trip through those
   two is editable; anything hand-built with `rule()` directly is not, and the
   panel shows it as a fixed condition instead of pretending otherwise.
   -------------------------------------------------------------------------- */

/** A rule: a readable claim, the bags it reads, and the test behind it. */
export const rule = (label, needs, test, filter = null) => ({ label, needs, test, filter });

export const atLeast = (label, get, min) => rule(label, [get.bag], (c) => {
  const v = get(c);
  return isNum(v) && v >= min;
}, { metric: get.key, op: 'gte', value: min });

/** Positive and at or below `max`, unless negatives are meaningful. */
export const atMost = (label, get, max, { allowNegative = false } = {}) => rule(label, [get.bag], (c) => {
  const v = get(c);
  if (!isNum(v)) return false;
  if (!allowNegative && v <= 0) return false;
  return v <= max;
}, { metric: get.key, op: 'lte', value: max, allowNegative });

export const between = (label, get, lo, hi) => rule(label, [get.bag], (c) => {
  const v = get(c);
  return isNum(v) && v >= lo && v <= hi;
}, { metric: get.key, op: 'between', value: [lo, hi] });

/**
 * A rule on one of the report's own factor scores.
 *
 * The same 0-MAX_SCORE scale the Ratings tab uses, and the same sector
 * distributions behind it — but computed by `scoreLite` over at most
 * `LITE_DEPTH[key]` metrics rather than the factor's full set.
 *
 * A company the screen could not measure **fails** the rule rather than
 * passing it. `null` is not a low score, and a screen asking for 4 out of 5
 * must not quietly admit the companies it knows nothing about.
 */
export const scoreAtLeast = (key, min) => {
  const meta = FACTOR_BY_KEY[key];
  return rule(
    `${meta.title} score of ${dec(min, 1)} or better out of ${MAX_SCORE}`,
    LITE_SOURCES[key] || BASE_BAGS,
    (c) => {
      const f = c.lite?.factors?.[key];
      return isNum(f?.score) && f.score >= min;
    },
    // Namespaced, because a factor key like `growth` would otherwise collide
    // with a ratio of the same name in the metric registry.
    { metric: `score:${key}`, op: 'gte', value: min },
  );
};

/**
 * A rule on the **composite** score rather than on one factor.
 *
 * `scoreAtLeast` takes a factor key, so it cannot express "rated Buy or
 * better overall" — which is the single most common thing a preset screen
 * filters on. Same refusal to guess: a company the screen could not measure
 * fails rather than passes.
 */
export const overallAtLeast = (min) => rule(
  `Overall score of ${dec(min, 1)} or better out of ${MAX_SCORE}`,
  BASE_BAGS,
  (c) => isNum(c.lite?.score) && c.lite.score >= min,
  { metric: 'score:overall', op: 'gte', value: min },
);

/* ==========================================================================
   The ideas

   Editorial, not derived. Each is a claim about what makes a company worth
   a second look, expressed as rules this data can actually test — which is
   the binding constraint on all of them. `universe` is what FMP screens
   server-side; `rules` run in the browser afterwards.

   `sort` picks the ordering. Where an idea has an obvious "more of this is
   the point" measure, it sorts on that; otherwise it falls back to the
   reduced score, which is what `sortByScore` marks.
   ========================================================================== */

export const BILLION = 1e9;

/**
 * Shared universe defaults: real, tradable, listed operating companies.
 *
 * Deliberately loose. Every extra server-side filter is another parameter
 * name that has to be exactly right, and a screener that silently ignores an
 * unknown parameter returns a wider universe than the idea claims. Size and
 * sector are the two worth spending on; funds are filtered again in the
 * browser after the call, where the check cannot be silently dropped.
 */
export const LISTED = {
  isEtf: false,
  isFund: false,
  isActivelyTrading: true,
  country: 'US',
  limit: 5000,
};

export const sortByScore = (c) => (isNum(c.lite?.score) ? c.lite.score : -1);
export const sortByFactor = (key) => (c) => {
  const v = c.lite?.factors?.[key]?.score;
  return isNum(v) ? v : -1;
};

/** The five single-factor screens, built from one shared template. */
function factorIdea(key, { tag, thesis, note }) {
  const meta = FACTOR_BY_KEY[key];
  return {
    key: `score-${key}`,
    group: 'Our ratings',
    title: `Top-rated on ${meta.title.toLowerCase()}`,
    tag,
    scoreIdea: true,
    thesis,
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: [scoreAtLeast(key, 4)],
    sort: sortByFactor(key),
    sortLabel: `${meta.title.toLowerCase()} score`,
    columns: [],
    note: `${note} This is a single-factor screen by design: it says nothing about the other `
      + 'four, and the score columns beside it are there so you can see what it ignored. The '
      + `${meta.title.toLowerCase()} score is built from at most ${LITE_DEPTH[key] || 0} ratios `
      + 'here, against that factor’s full set on a Ratings tab.',
  };
}

export const IDEAS = [
  /* ---- the score screens, which are what the ratings are for ---- */
  {
    key: 'score-all-round',
    group: 'Our ratings',
    title: 'Strong on every factor',
    tag: 'All five',
    scoreIdea: true,
    thesis: 'Four out of five on valuation, growth, profitability, financial health and momentum '
      + 'at the same time. Deliberately the hardest screen here — most good companies are '
      + 'expensive, most cheap ones are cheap for a reason, and a name clearing all five at once '
      + 'is rare enough that an empty result is a real answer rather than a broken screen.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: FACTOR_KEYS.map((k) => scoreAtLeast(k, 4)),
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: [],
    note: 'Each of the five has to be measurable as well as high. A company whose price history '
      + 'or growth feed did not load fails on the factor it could not be measured on rather than '
      + 'passing on the ones it could, which is the only safe way round for a screen this strict.',
  },

  factorIdea('valuation', {
    tag: 'Value',
    thesis: 'Priced in roughly the cheapest fifth of its own sector on the multiples and yields '
      + 'this report grades — earnings, sales, book, cash flow, and the yields that invert them. '
      + 'Sector-relative throughout, so a utility is judged against utilities rather than against '
      + 'software.',
    note: 'A high valuation score is a statement about price, not about quality.',
  }),

  factorIdea('growth', {
    tag: 'Growth',
    thesis: 'Growing faster than most of its sector on the lines that matter — revenue, earnings, '
      + 'cash flow, book value — measured against what its own sector managed rather than against '
      + 'an absolute bar.',
    note: 'Growth here is the last filed year against the one before it, so it is history rather '
      + 'than a forecast.',
  }),

  factorIdea('profitability', {
    tag: 'Quality',
    thesis: 'Turning revenue into profit and capital into returns better than most of its sector: '
      + 'margins at every level, returns on equity, assets and invested capital, and how much of '
      + 'the profit arrives as cash.',
    note: 'The best single description of a business worth owning, and a poor one of a share '
      + 'worth buying at any price.',
  }),

  factorIdea('health', {
    tag: 'Safety',
    thesis: 'A balance sheet in the top fifth of its sector — liquidity, leverage and coverage '
      + 'together. The screen that matters least in a rising market and most in a falling one.',
    note: 'Sector-relative, so a bank and a software company are each judged against their own '
      + 'kind rather than against each other.',
  }),

  factorIdea('momentum', {
    tag: 'Momentum',
    thesis: 'The market has been re-rating it, and by more than most of its sector: the three, '
      + 'six, nine and twelve-month returns, what it gave back at the worst point, and how '
      + 'volatile the ride was.',
    note: 'Momentum is the one factor here that says nothing whatever about the business. It '
      + 'costs an extra feed per company — the price history — so this screen tests fewer '
      + 'candidates than the others.',
  }),

  {
    key: 'compounding-growth',
    group: 'Growth',
    title: 'Growing and getting better at it',
    tag: 'Growth',
    thesis: 'Revenue and earnings both rising, with the cash following them. Growth on the top '
      + 'line alone is the easiest thing in the world to buy; growth that reaches the bottom line '
      + 'and then the bank account is not.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: [
      atLeast('Revenue growing above 10%', F.revenueGrowth, 0.10),
      atLeast('Earnings per share growing above 10%', F.epsGrowth, 0.10),
      atLeast('Free cash flow growing', F.fcfGrowth, 0),
      atLeast('Return on invested capital above 10%', F.roic, 0.10),
    ],
    sort: (c) => F.revenueGrowth(c) ?? -1,
    sortLabel: 'revenue growth',
    columns: ['revenueGrowth', 'epsGrowth', 'roic'],
    note: 'Growth figures are the last filed fiscal year against the one before it, not the '
      + 'trailing twelve months — so a company that turned a corner two quarters ago will not '
      + 'show it here yet.',
  },

  /* ---- eligibility filter plus a ranking, rather than a set of rules ----
     A different shape from everything else on this page. The screens above
     ask a question and list whoever answers it; this one defines who is
     eligible and then ranks the eligible on the report's own composite,
     keeping a fixed number.

     That is how the published retail "AI portfolio" strategies are built —
     an eligibility layer of sector, region, size, price and liquidity, then a
     model that ranks inside it, then a holdings cap. The eligibility layer is
     ordinary screening and reproduces almost exactly. The ranking model does
     not: theirs learns weights from decades of realised forward returns,
     and this one is an equal-weighted percentile rank against the sector as
     it stands today. Same inputs, different question — so the constituents
     will not match, and the card says so rather than implying otherwise.
     -------------------------------------------------------------------- */
  {
    key: 'us-tech-top15',
    group: 'Ranked portfolios',
    title: 'US technology leaders, top 15',
    tag: 'Ranked',
    scoreIdea: true,
    ranked: true,
    resultLimit: 15,
    // No rule reads growth or price history, but the ranking should: a
    // composite built from two feeds would rank on valuation, profitability
    // and health alone and call the result a leader board.
    bags: ['growth', 'returns'],
    thesis: 'Every US-listed technology company over $1b, priced over $10 and actually trading, '
      + 'ranked on this report’s own composite score and cut at fifteen holdings. The filters '
      + 'decide who is eligible; the score decides who is in.',
    universe: {
      ...LISTED,
      sector: 'Technology',
      marketCapMoreThan: 1 * BILLION,
      priceMoreThan: 10,
      volumeMoreThan: 1000,
    },
    rules: [],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: [],
    note: 'Two things about the eligibility filters do not map cleanly. The vendor’s sector '
      + 'field is "Technology" rather than the GICS "Information Technology", and the two '
      + 'disagree at the edges — GICS puts Alphabet and Meta in Communication Services and '
      + 'Amazon in Consumer Discretionary, and this data may not. There is also no thematic '
      + 'tag in this data, so a "theme" filter has no equivalent; here it would be redundant '
      + 'with the sector anyway. Everything else — region, market cap, price, volume, holdings '
      + 'cap — maps directly.',
  },

  {
    key: 'us-value-top20',
    group: 'Ranked portfolios',
    title: 'US value, top 20',
    tag: 'Ranked',
    scoreIdea: true,
    ranked: true,
    resultLimit: 20,
    bags: ['growth', 'returns'],
    /*
     * Double the standard budget, and the reason is methodological rather
     * than generous.
     *
     * Candidates are taken largest first, and the largest companies are the
     * least likely to trade under 15x earnings. A sector screen can live with
     * that bias because it is asking about an attribute size does not predict;
     * a value screen cannot, because size predicts the attribute directly and
     * the sample would be selected against the thing being looked for. Twice
     * the budget is not a fix, only a deeper sample — the honest ceiling is
     * still stated under the table.
     */
    budget: 1200,
    thesis: 'US-listed mid and large caps trading under fifteen times earnings, ranked on this '
      + 'report’s composite and cut at twenty holdings. A low multiple is where a value search '
      + 'starts rather than where it ends: the ranking is what separates a company the market '
      + 'has overlooked from one it has correctly marked down.',
    universe: {
      ...LISTED,
      marketCapMoreThan: 2 * BILLION,
      marketCapLowerThan: 200 * BILLION,
      volumeMoreThan: 1000,
    },
    rules: [
      atMost('P/E under 15', F.pe, 15),
    ],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['pe', 'pb', 'roe'],
    note: 'Three things a reader comparing this against a published value portfolio should '
      + 'know. First, the source material disagrees with itself: the strategy description names '
      + 'a P/E under 15 as its primary criterion while the filter panel shows a theme of P/E '
      + 'under 35. The stricter figure is used here because it is the one that makes the '
      + 'strategy a value strategy — the looser one admits most of the market. Second, mid and '
      + 'large cap are read as $2b to $200b; the published filters name the buckets but not the '
      + 'boundaries, so those numbers are an assumption. Third, a P/E screen quietly excludes '
      + 'every company that lost money, which is a real filter nobody states — a loss makes the '
      + 'ratio meaningless rather than high.',
  },

  /* ---- value, on somebody's estimate of what it is worth ---- */
  {
    key: 'below-fair-value',
    group: 'Value',
    title: 'Trading below estimated fair value',
    tag: 'Value',
    thesis: 'The share price sits at least a fifth below the vendor’s levered discounted cash '
      + 'flow, and the business behind it is actually profitable. The discount is the reason to '
      + 'look; the profitability test is what stops the screen filling up with companies that '
      + 'are cheap because they are broken.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: [
      atLeast('At least 20% below fair value', F.discount, 0.20),
      atLeast('Profitable on a net basis', F.netMargin, 0.03),
      atLeast('Return on equity above 8%', F.roe, 0.08),
      atMost('Debt under 1.5× equity', F.debtToEquity, 1.5),
    ],
    sort: (c) => F.discount(c) ?? -1,
    sortLabel: 'discount to fair value',
    columns: ['discount', 'pe', 'roe'],
    note: 'The fair value is one vendor’s discounted cash flow with one set of assumptions, '
      + 'not this report’s. The report deliberately never grades a fair value — a model is a '
      + 'set of assumptions the reader picks — and a filter is not a grade, but the number is '
      + 'still somebody else’s opinion rather than a fact about the company.',
  },

  {
    key: 'value-and-quality',
    group: 'Value',
    title: 'Cheap on the multiples, sound underneath',
    tag: 'Value',
    thesis: 'The classic value screen with the trap removed. Low multiples on earnings, book and '
      + 'sales at once, but only for companies earning a real return and covering their interest '
      + '— which is what separates a bargain from a value trap.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: [
      atMost('P/E under 15', F.pe, 15),
      atMost('P/B under 3', F.pb, 3),
      atLeast('Return on equity above 12%', F.roe, 0.12),
      atLeast('Interest covered more than 5×', F.interestCover, 5),
    ],
    sort: (c) => -(F.pe(c) ?? 1e9),
    sortLabel: 'lowest P/E',
    columns: ['pe', 'pb', 'roe'],
  },

  /* ---- what the people running the company are doing ---- */
  {
    key: 'insider-buying',
    group: 'Insider signals',
    title: 'Insiders have been buying',
    tag: 'Insider',
    thesis: 'Directors and officers bought more stock than they sold over the last four reported '
      + 'quarters. Insider selling means very little — most of it is vesting and tax — but '
      + 'insider buying is somebody with better information choosing to increase their exposure '
      + 'with their own money.',
    universe: { ...LISTED, marketCapMoreThan: 0.5 * BILLION },
    rules: [
      atLeast('Net buyers over four quarters', F.insiderNet, 1),
      atLeast('Bought a meaningful number of shares', F.insiderBought, 10000),
      atLeast('Profitable on a net basis', F.netMargin, 0.01),
    ],
    sort: (c) => F.insiderNet(c) ?? -1,
    sortLabel: 'net shares bought',
    columns: ['insiderNet', 'pe', 'netMargin'],
    note: 'Share counts, not dollars — the statistics feed reports quantities. Ten thousand '
      + 'shares of a $5 stock and of a $500 one are very different commitments, so read the '
      + 'count against the price rather than on its own.',
  },

  {
    key: 'undervalued-insider-buying',
    group: 'Insider signals',
    title: 'Undervalued smaller companies insiders are buying',
    tag: 'Insider',
    thesis: 'The two signals together, in the part of the market where they matter most. Small '
      + 'companies are the least covered by analysts, so a discount is more likely to be real — '
      + 'and insiders buying into that discount is the strongest version of the argument.',
    universe: {
      ...LISTED,
      marketCapMoreThan: 0.3 * BILLION,
      marketCapLowerThan: 10 * BILLION,
      volumeMoreThan: 50000,
    },
    rules: [
      atLeast('At least 15% below fair value', F.discount, 0.15),
      atLeast('Net buyers over four quarters', F.insiderNet, 1),
      atLeast('Profitable on a net basis', F.netMargin, 0.01),
    ],
    sort: (c) => F.discount(c) ?? -1,
    sortLabel: 'discount to fair value',
    columns: ['discount', 'insiderNet', 'netMargin'],
    note: 'The narrowest screen here: it needs a discount, a net insider buy and a profit at the '
      + 'same time, in a size band where any of the three may be missing from the data. An empty '
      + 'result is common and is not a fault.',
  },

  {
    key: 'founder-held-growth',
    group: 'Insider signals',
    title: 'Closely held and growing',
    tag: 'Insider',
    thesis: 'A large block of the company is not freely traded — a founder, a family, a '
      + 'strategic holder — and the business is growing. The argument is alignment: an owner '
      + 'with a fifth of the shares is not managing to the next quarter.',
    universe: { ...LISTED, marketCapMoreThan: 0.5 * BILLION },
    rules: [
      atLeast('At least 20% closely held', F.closelyHeld, 0.20),
      atLeast('Revenue growing above 8%', F.revenueGrowth, 0.08),
      atLeast('Return on equity above 10%', F.roe, 0.10),
    ],
    sort: (c) => F.closelyHeld(c) ?? -1,
    sortLabel: 'share closely held',
    columns: ['closelyHeld', 'revenueGrowth', 'roe'],
    note: 'Closely held is the complement of the vendor’s free float, so it is a proxy for '
      + 'insider ownership rather than a measure of it. A founder’s stake, a family trust, a '
      + 'government holding and a cross-shareholding all land in the same number, and the feed '
      + 'does not say which.',
  },

  /* ---- what the street expects next ---- */
  {
    key: 'forecast-growth',
    group: 'Growth',
    title: 'Forecast to grow earnings fast',
    tag: 'Forecast',
    thesis: 'Analysts expect earnings per share to compound above 20% a year across the estimate '
      + 'window, and enough of them cover the name for that to be a consensus rather than one '
      + 'model. The only screen here that looks forward rather than back.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: [
      atLeast('Forecast EPS growth above 20% a year', F.fwdEpsGrowth, 0.20),
      atLeast('Forecast revenue growth above 8% a year', F.fwdRevenueGrowth, 0.08),
      atLeast('Covered by at least 5 analysts', F.analysts, 5),
      atLeast('Profitable today', F.netMargin, 0.01),
    ],
    sort: (c) => F.fwdEpsGrowth(c) ?? -1,
    sortLabel: 'forecast EPS growth',
    columns: ['fwdEpsGrowth', 'fwdRevenueGrowth', 'analysts'],
    note: 'A consensus is a mean of models, and the far years of one are a much thinner sample '
      + 'than the near years. The growth rate here is the median year-on-year step across the '
      + 'window rather than an endpoint rate, which stops one bad year deciding the number.',
  },

  {
    key: 'growth-at-a-price',
    group: 'Growth',
    title: 'Growth at a reasonable price',
    tag: 'GARP',
    thesis: 'Growing meaningfully, and not priced as though it will keep doing so for ever. PEG '
      + 'is the crude version of this trade-off and it is crude on purpose — the point is to '
      + 'exclude the names where every year of the next decade is already in the price.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: [
      atMost('PEG under 1.5', F.peg, 1.5),
      atLeast('Revenue growing above 8%', F.revenueGrowth, 0.08),
      atLeast('Return on invested capital above 10%', F.roic, 0.10),
      atMost('P/E under 30', F.pe, 30),
    ],
    sort: (c) => -(F.peg(c) ?? 1e9),
    sortLabel: 'lowest PEG',
    columns: ['peg', 'revenueGrowth', 'roic'],
  },

  /* ---- size bands ---- */
  {
    key: 'midcap-momentum',
    group: 'Momentum',
    title: 'Mid caps the market has noticed',
    tag: 'Mid cap',
    thesis: 'Between two and twenty billion — big enough to be liquid and covered, small '
      + 'enough that a good year still moves the price. Rising over twelve months, without the '
      + 'drawdown that says the rise was a bounce off a collapse.',
    universe: {
      ...LISTED,
      marketCapMoreThan: 2 * BILLION,
      marketCapLowerThan: 20 * BILLION,
    },
    rules: [
      atLeast('Up more than 15% over a year', F.return1y, 0.15),
      atLeast('Up over six months as well', F.return6m, 0),
      atMost('Worst fall inside the year under 30%', F.drawdown, 0.30),
      atLeast('Profitable on a net basis', F.netMargin, 0.02),
    ],
    sort: (c) => F.return1y(c) ?? -1,
    sortLabel: 'one-year return',
    columns: ['return1y', 'return6m', 'drawdown'],
    note: 'Price returns exclude dividends, and a screen on past return is the one screen here '
      + 'with no claim about the business at all. It is included because momentum is a factor '
      + 'this report already grades, not because a rise predicts another one.',
  },

  /* ---- the ratio screens ---- */
  {
    key: 'quality-cheap',
    group: 'Value',
    title: 'Quality at a fair price',
    tag: 'Any sector',
    thesis: 'A business earning a high return on the capital it employs, priced no higher than '
      + 'the market as a whole. The combination is the rarer half of "quality investing" — plenty '
      + 'of companies earn good returns, and most of them are priced for it.',
    universe: { ...LISTED, marketCapMoreThan: 2 * BILLION },
    rules: [
      atLeast('Return on invested capital above 15%', F.roic, 0.15),
      atLeast('Return on equity above 15%', F.roe, 0.15),
      atMost('P/E under 22', F.pe, 22),
      atLeast('Operating margin above 12%', F.operatingMargin, 0.12),
    ],
    sort: (c) => F.roic(c) ?? -1,
    sortLabel: 'return on invested capital',
    columns: ['pe', 'roic', 'operatingMargin'],
  },

  {
    key: 'dividend-compounders',
    group: 'Income',
    title: 'Dividend compounders',
    tag: 'Income',
    thesis: 'A yield you can live on, covered twice over — once by profit and again by the cash '
      + 'that actually pays it. The cover test is the point: a high yield with a thin payout '
      + 'ratio is income, and a high yield with a stretched one is a warning.',
    universe: { ...LISTED, marketCapMoreThan: 2 * BILLION, dividendMoreThan: 0 },
    rules: [
      between('Yield between 2% and 8%', F.dividendYield, 0.02, 0.08),
      atMost('Pays out under 65% of earnings', F.payout, 0.65),
      atLeast('Free cash flow is 70%+ of operating cash flow', F.fcfToOcf, 0.70),
      atMost('Net debt under 3× EBITDA', F.netDebtToEbitda, 3, { allowNegative: true }),
    ],
    sort: (c) => F.dividendYield(c) ?? -1,
    sortLabel: 'dividend yield',
    columns: ['dividendYield', 'payout', 'netDebtToEbitda'],
    note: 'The yield ceiling is deliberate. Above about 8% the figure is usually a share price '
      + 'that has already fallen, and the screen would be selecting for exactly the distress it '
      + 'is meant to avoid.',
  },

  {
    key: 'fortress',
    group: 'Quality and safety',
    title: 'Fortress balance sheets',
    tag: 'Defensive',
    thesis: 'Companies that could survive a bad year without asking anyone for anything: more '
      + 'cash than debt, comfortable liquidity, and interest costs covered many times over. The '
      + 'least exciting screen here, and the one that matters most when credit tightens.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: [
      atMost('Debt under half of equity', F.debtToEquity, 0.5),
      atLeast('Current ratio above 1.5', F.currentRatio, 1.5),
      atLeast('Interest covered more than 10×', F.interestCover, 10),
      atLeast('Profitable on a net basis', F.netMargin, 0.01),
    ],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['debtToEquity', 'currentRatio', 'interestCover'],
  },

  {
    key: 'cash-machines',
    group: 'Quality and safety',
    title: 'Cash machines',
    tag: 'Cash flow',
    thesis: 'Businesses whose profit turns into cash and whose cash is not immediately eaten by '
      + 'the next round of capital spending. Earnings can be shaped by accounting choices; a free '
      + 'cash flow yield is much harder to argue with.',
    universe: { ...LISTED, marketCapMoreThan: 2 * BILLION },
    rules: [
      atLeast('Free cash flow yield above 5%', F.fcfYield, 0.05),
      atLeast('Operating cash flow converts to profit above 1×', F.incomeQuality, 1),
      atMost('Capital spending under 8% of revenue', F.capexToRevenue, 0.08),
      atLeast('Free cash flow is 60%+ of operating cash flow', F.fcfToOcf, 0.60),
    ],
    sort: (c) => F.fcfYield(c) ?? -1,
    sortLabel: 'free cash flow yield',
    columns: ['fcfYield', 'incomeQuality', 'capexToRevenue'],
  },

  {
    key: 'tech-margins',
    group: 'Sectors',
    title: 'Technology that earns its multiple',
    tag: 'Technology',
    thesis: 'The sector is priced for growth almost everywhere, so the question is which names '
      + 'have the economics to justify it. Gross margin is the closest thing to a proxy for '
      + 'pricing power, and reinvestment in R&D is what keeps it there.',
    universe: { ...LISTED, sector: 'Technology', marketCapMoreThan: 2 * BILLION },
    rules: [
      atLeast('Gross margin above 55%', F.grossMargin, 0.55),
      atLeast('Operating margin above 15%', F.operatingMargin, 0.15),
      atLeast('Spends 5%+ of revenue on R&D', F.rdToRevenue, 0.05),
      atLeast('Return on invested capital above 12%', F.roic, 0.12),
    ],
    sort: (c) => F.grossMargin(c) ?? -1,
    sortLabel: 'gross margin',
    columns: ['grossMargin', 'rdToRevenue', 'pe'],
  },

  {
    key: 'healthcare-durable',
    group: 'Sectors',
    title: 'Durable healthcare',
    tag: 'Healthcare',
    thesis: 'Healthcare demand does not track the cycle, but healthcare balance sheets often '
      + 'carry the debt of an acquisition spree. This looks for the profitable half of the sector '
      + 'that has not borrowed its way to scale.',
    universe: { ...LISTED, sector: 'Healthcare', marketCapMoreThan: 2 * BILLION },
    rules: [
      atLeast('Operating margin above 12%', F.operatingMargin, 0.12),
      atMost('Net debt under 2.5× EBITDA', F.netDebtToEbitda, 2.5, { allowNegative: true }),
      atLeast('Return on equity above 12%', F.roe, 0.12),
      atLeast('Free cash flow yield above 3%', F.fcfYield, 0.03),
    ],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['operatingMargin', 'roe', 'netDebtToEbitda'],
  },

  {
    key: 'industrial-workhorses',
    group: 'Sectors',
    title: 'Industrial workhorses',
    tag: 'Industrials',
    thesis: 'Capital-heavy businesses live or die on how hard they work their asset base. High '
      + 'asset turnover with a real return on capital is what separates an operator from a '
      + 'company that merely owns a lot of equipment.',
    universe: { ...LISTED, sector: 'Industrials', marketCapMoreThan: 1 * BILLION },
    rules: [
      atLeast('Asset turnover above 0.8×', F.assetTurnover, 0.8),
      atLeast('Return on capital above 10%', F.roic, 0.10),
      atMost('Debt under 1× equity', F.debtToEquity, 1),
      atLeast('Interest covered more than 5×', F.interestCover, 5),
    ],
    sort: (c) => F.roic(c) ?? -1,
    sortLabel: 'return on invested capital',
    columns: ['assetTurnover', 'roic', 'debtToEquity'],
  },

  {
    key: 'small-profitable',
    group: 'Size',
    title: 'Profitable smaller companies',
    tag: 'Small cap',
    thesis: 'Most of the small-cap universe does not make money. This is the part that does, is '
      + 'not carrying much debt, and is priced below where a profitable large cap would be — '
      + 'which is where the size discount is supposed to live.',
    universe: {
      ...LISTED,
      marketCapMoreThan: 0.3 * BILLION,
      marketCapLowerThan: 5 * BILLION,
      volumeMoreThan: 100000,
    },
    rules: [
      atLeast('Net margin above 8%', F.netMargin, 0.08),
      atLeast('Return on equity above 12%', F.roe, 0.12),
      atMost('P/E under 18', F.pe, 18),
      atMost('Debt under 1× equity', F.debtToEquity, 1),
    ],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['pe', 'netMargin', 'roe'],
    note: 'A minimum daily volume is part of the universe here and nowhere else. A small company '
      + 'that barely trades can screen beautifully and still be impossible to buy or sell at '
      + 'anything near the printed price.',
  },

  /* ==========================================================================
     Featured screens

     The preset screens a reader arriving from another research product looks
     for by name, under those names. Fourteen of them; what each one screens
     for is ours, because the thresholds behind a competitor's preset are not
     published and inventing a match would be a worse kind of copy than an
     honest equivalent.

     Three notes that apply to the whole group:

     * **A sector or industry screen is ranked, not ruled.** "The best
       biotechnology stocks" cannot be a ratio screen — most of that industry
       is pre-revenue and every margin rule would empty the list. Eligibility
       is the industry; the composite decides the order. That is also how the
       products these are named after describe them.
     * **`industry` is a vendor parameter this app had not used before.** If
       FMP renames a classification, the screen silently widens rather than
       failing, so each one prints the industry it asked for.
     * **Six of the catalogue are missing on purpose.** Most Shorted Stocks
       needs short interest, which none of the 34 feeds carries; the three ETF
       screens need an ETF data path and a grading model that is not
       sector-relative company fundamentals; and the AI and crypto screens need
       a thematic classification the vendor does not publish. §18 records all
       six rather than shipping a label with the wrong thing under it.
     ========================================================================== */

  {
    key: 'top-rated-stocks',
    group: 'Featured screens',
    title: 'Top Rated Stocks',
    tag: 'Strong buy',
    scoreIdea: true,
    thesis: 'Rated Strong Buy on the composite — the top band of this report’s own rating, over '
      + 'every ratio it could rank against the sector. The broadest of the featured screens and '
      + 'the one closest to "what does the model like right now".',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    bags: ['growth', 'returns'],
    rules: [overallAtLeast(4)],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['pe', 'roic', 'revenueGrowth'],
    note: 'Not the same screen as "Strong on every factor", which asks for four out of five on '
      + 'all five factors at once. This asks for four out of five on the average, which a company '
      + 'can reach with one outstanding factor carrying four ordinary ones. The factor columns '
      + 'are there so you can see which of the two you are looking at.',
  },

  {
    key: 'stocks-by-quant',
    group: 'Featured screens',
    title: 'Stocks by Quant',
    tag: 'Ranked',
    scoreIdea: true,
    ranked: true,
    resultLimit: 50,
    bags: ['growth', 'returns'],
    thesis: 'Every company in the universe ranked by the composite, with no rule to pass first. '
      + 'The plain leader board: no thesis, no thresholds, just the score in order.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: [],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['pe', 'roic', 'dividendYield'],
    note: 'Ranked over the tested sample rather than the whole market — candidates are taken '
      + 'largest first and capped, so this is the best fifty of a few hundred rather than of '
      + 'several thousand. The funnel under the table says how many were actually tested.',
  },

  {
    key: 'top-dividend-stocks',
    group: 'Featured screens',
    title: 'Top Dividend Stocks',
    tag: 'Income',
    thesis: 'A dividend worth owning for the income: a yield above the market’s, a payout ratio '
      + 'that leaves room, and enough cash conversion to keep paying it. Yield-led — the rating '
      + 'screen is the next one along.',
    universe: { ...LISTED, marketCapMoreThan: 2 * BILLION, dividendMoreThan: 0 },
    rules: [
      atLeast('Yield of 3% or better', F.dividendYield, 0.03),
      atMost('Pays out under 75% of earnings', F.payout, 0.75),
      atLeast('Free cash flow is 60%+ of operating cash flow', F.fcfToOcf, 0.60),
    ],
    sort: (c) => F.dividendYield(c) ?? -1,
    sortLabel: 'dividend yield',
    columns: ['dividendYield', 'payout', 'fcfToOcf'],
    note: 'Three per cent is a floor rather than a target: below it the income case is thin '
      + 'enough that the question becomes a total-return one, which the growth and value screens '
      + 'answer better.',
  },

  {
    key: 'top-quant-dividend-stocks',
    group: 'Featured screens',
    title: 'Top Quant Dividend Stocks',
    tag: 'Income',
    scoreIdea: true,
    thesis: 'Dividend payers that also rate well on the composite. The same universe as the '
      + 'screen above approached from the other end: the rating decides eligibility and the '
      + 'yield is a condition rather than the point.',
    universe: { ...LISTED, marketCapMoreThan: 2 * BILLION, dividendMoreThan: 0 },
    bags: ['growth', 'returns'],
    rules: [
      overallAtLeast(3.5),
      atLeast('Pays a dividend at all', F.dividendYield, 0.001),
      atMost('Pays out under 80% of earnings', F.payout, 0.80),
    ],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['dividendYield', 'payout', 'roic'],
    note: 'A rating-led income screen will return lower yields than a yield-led one, and that is '
      + 'the trade being made rather than a fault in it: the companies that rank best on the '
      + 'other four factors are rarely the ones paying the most out.',
  },

  {
    key: 'top-yield-monsters',
    group: 'Featured screens',
    title: 'Top Yield Monsters',
    tag: 'High yield',
    thesis: 'The highest yields in the market that still clear a solvency test. Seven per cent '
      + 'and up is where the yield stops being a decision about income and starts being a '
      + 'statement about risk, so the rules here are about whether the payment survives.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION, dividendMoreThan: 0 },
    rules: [
      atLeast('Yield of 7% or better', F.dividendYield, 0.07),
      atMost('Pays out under 100% of earnings', F.payout, 1.0),
      atMost('Net debt under 5× EBITDA', F.netDebtToEbitda, 5, { allowNegative: true }),
      atLeast('Profitable on a net basis', F.netMargin, 0.001),
    ],
    sort: (c) => F.dividendYield(c) ?? -1,
    sortLabel: 'dividend yield',
    columns: ['dividendYield', 'payout', 'netDebtToEbitda'],
    note: 'Read this screen backwards. A 7% yield is usually a price that has already fallen, so '
      + 'the useful question is not "how much does it pay" but "what does the market know that '
      + 'the payout ratio does not show". The solvency rules remove the worst of it and cannot '
      + 'remove all of it.',
  },

  {
    key: 'high-dividend-yield-stocks',
    group: 'Featured screens',
    title: 'High Dividend Yield Stocks',
    tag: 'High yield',
    thesis: 'Yields above 4% with a payout that is still covered. The middle ground between an '
      + 'ordinary income screen and the distressed end of the yield curve.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION, dividendMoreThan: 0 },
    rules: [
      between('Yield between 4% and 12%', F.dividendYield, 0.04, 0.12),
      atMost('Pays out under 85% of earnings', F.payout, 0.85),
      atLeast('Free cash flow is 50%+ of operating cash flow', F.fcfToOcf, 0.50),
    ],
    sort: (c) => F.dividendYield(c) ?? -1,
    sortLabel: 'dividend yield',
    columns: ['dividendYield', 'payout', 'netDebtToEbitda'],
    note: 'The 12% ceiling excludes the arithmetic artefacts rather than the risky companies: a '
      + 'trailing yield far above that is usually a special dividend annualised, or a price that '
      + 'fell after the last declaration.',
  },

  {
    key: 'top-dividend-growth-stocks',
    group: 'Featured screens',
    title: 'Top Dividend Growth Stocks',
    tag: 'Dividend growth',
    thesis: 'A smaller dividend today with the earnings behind it to raise tomorrow. The low '
      + 'payout ratio is the point — it is the room a company needs to keep increasing without '
      + 'the increase costing it anything it wanted to spend elsewhere.',
    universe: { ...LISTED, marketCapMoreThan: 2 * BILLION, dividendMoreThan: 0 },
    rules: [
      atLeast('Pays a dividend at all', F.dividendYield, 0.001),
      atMost('Pays out under 50% of earnings', F.payout, 0.50),
      atLeast('Earnings per share growing above 8%', F.epsGrowth, 0.08),
      atLeast('Free cash flow growing', F.fcfGrowth, 0),
    ],
    sort: (c) => F.epsGrowth(c) ?? -1,
    sortLabel: 'earnings growth',
    columns: ['dividendYield', 'payout', 'epsGrowth'],
    note: 'This report has no dividend *history* in the screening path, so the growth tested '
      + 'here is the earnings behind the dividend rather than a run of increases. A company that '
      + 'has raised its payout for twenty years and one that started last quarter both pass, and '
      + 'the record is on the company’s own Dividends tab.',
  },

  {
    key: 'top-growth-stocks',
    group: 'Featured screens',
    title: 'Top Growth Stocks',
    tag: 'Growth',
    scoreIdea: true,
    thesis: 'Growing faster than most of its sector on the lines that matter, and doing it on the '
      + 'top line and the bottom line together. Growth on revenue alone is the easiest thing in '
      + 'the market to buy.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    bags: ['returns'],
    rules: [
      scoreAtLeast('growth', 4),
      atLeast('Revenue growing above 15%', F.revenueGrowth, 0.15),
      atLeast('Earnings per share growing', F.epsGrowth, 0),
    ],
    sort: (c) => F.revenueGrowth(c) ?? -1,
    sortLabel: 'revenue growth',
    columns: ['revenueGrowth', 'epsGrowth', 'grossMargin'],
    note: 'The growth score is sector-relative and the 15% floor is absolute, so both have to '
      + 'hold: a company growing 12% in a sector growing 4% scores well and does not clear the '
      + 'floor. That is deliberate — a screen called Top Growth Stocks should not return the '
      + 'fastest-growing utility.',
  },

  {
    key: 'top-value-stocks',
    group: 'Featured screens',
    title: 'Top Value Stocks',
    tag: 'Value',
    scoreIdea: true,
    thesis: 'In the cheapest part of its sector on the multiples, and profitable enough that the '
      + 'discount is a price rather than a diagnosis. The profitability floor is what separates '
      + 'this from a list of companies that are cheap for a reason.',
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    bags: ['growth', 'returns'],
    rules: [
      scoreAtLeast('valuation', 4),
      atLeast('Profitable on a net basis', F.netMargin, 0.02),
      scoreAtLeast('health', 3),
    ],
    sort: sortByFactor('valuation'),
    sortLabel: 'valuation score',
    columns: ['pe', 'pb', 'fcfYield'],
    note: 'The balance-sheet condition is the one doing the quiet work. Cheap multiples and a '
      + 'stretched balance sheet is the combination that turns a value screen into a list of '
      + 'companies the market has already decided about.',
  },

  {
    key: 'top-small-cap-stocks',
    group: 'Featured screens',
    title: 'Top Small Cap Stocks',
    tag: 'Small cap',
    scoreIdea: true,
    thesis: 'Companies between $300m and $2b that still rate well. Small enough to be under-'
      + 'covered, large enough to be tradable, and held to the same composite as everything else.',
    universe: { ...LISTED, marketCapMoreThan: 300e6, marketCapLowerThan: 2 * BILLION, priceMoreThan: 3 },
    bags: ['growth', 'returns'],
    rules: [
      overallAtLeast(3.5),
      atLeast('Profitable on a net basis', F.netMargin, 0.001),
    ],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['pe', 'roic', 'revenueGrowth'],
    note: 'Candidates are taken largest first, so a small-cap screen samples the top of its own '
      + 'range rather than the middle of it — this is the best of the larger small caps, not of '
      + 'all of them. The $3 share price floor removes the sub-dollar tail, where the spread '
      + 'often costs more than the thesis is worth.',
  },

  {
    key: 'top-tech-stocks',
    group: 'Featured screens',
    title: 'Top Tech Stocks',
    tag: 'Technology',
    scoreIdea: true,
    ranked: true,
    resultLimit: 25,
    bags: ['growth', 'returns'],
    thesis: 'Every technology company over $2b, ranked by the composite and cut at twenty-five. '
      + 'Eligibility is the sector; the score decides the order.',
    universe: { ...LISTED, sector: 'Technology', marketCapMoreThan: 2 * BILLION },
    rules: [],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['pe', 'revenueGrowth', 'roic'],
    note: 'Close to "US technology leaders, top 15" under Ranked portfolios, and worth knowing '
      + 'how they differ: that one adds a $10 price and a volume floor and cuts at fifteen, so it '
      + 'is the tradability-filtered version of this list. The vendor’s "Technology" is also not '
      + 'GICS Information Technology — Alphabet, Meta and Amazon sit elsewhere in GICS and may '
      + 'not here.',
  },

  {
    key: 'top-biotechnology-stocks',
    group: 'Featured screens',
    title: 'Top Biotechnology Stocks',
    tag: 'Biotech',
    scoreIdea: true,
    ranked: true,
    resultLimit: 25,
    bags: ['growth', 'returns'],
    thesis: 'Biotechnology companies over $1b, ranked by the composite. Ranked rather than '
      + 'ruled on purpose: most of this industry is pre-revenue, and any margin or earnings rule '
      + 'would return an empty list and call it a finding.',
    universe: { ...LISTED, industry: 'Biotechnology', marketCapMoreThan: 1 * BILLION },
    rules: [],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['pb', 'revenueGrowth', 'currentRatio'],
    note: 'Treat the composite here more cautiously than elsewhere. Valuation multiples on a '
      + 'company with no earnings are undefined rather than low, so the factor is graded on '
      + 'fewer ratios than usual and the count beside each score says how many. Cash runway — '
      + 'the thing that actually decides a pre-revenue biotech — is not one of them.',
  },

  {
    key: 'top-semiconductor-stocks',
    group: 'Featured screens',
    title: 'Top Semiconductor Stocks',
    tag: 'Semiconductors',
    scoreIdea: true,
    ranked: true,
    resultLimit: 25,
    bags: ['growth', 'returns'],
    thesis: 'Semiconductor companies over $1b, ranked by the composite. The most cyclical '
      + 'industry in the technology sector, judged on the same ratios as everything else.',
    universe: { ...LISTED, industry: 'Semiconductors', marketCapMoreThan: 1 * BILLION },
    rules: [],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['pe', 'grossMargin', 'revenueGrowth'],
    note: 'Every figure here is trailing, and this industry’s trailing figures are at their best '
      + 'at the top of a cycle. A high growth score late in an upturn is a description of the '
      + 'last twelve months, not a forecast of the next twelve. Equipment makers are classified '
      + 'separately by the vendor and are not in this list.',
  },

  {
    key: 'all-stocks',
    group: 'Featured screens',
    title: 'All Stocks',
    tag: 'Everything',
    scoreIdea: true,
    ranked: true,
    resultLimit: 50,
    bags: ['growth', 'returns'],
    thesis: 'The whole universe with no rule applied, ranked by the composite. The blank screen: '
      + 'the place to start if you would rather add your own filters than begin from somebody '
      + 'else’s thesis.',
    universe: { ...LISTED, marketCapMoreThan: 300e6 },
    rules: [],
    sort: sortByScore,
    sortLabel: 'overall score',
    columns: ['pe', 'roic', 'dividendYield'],
    note: 'The one screen on this page whose label is honest about returning everything. It is '
      + 'still the best fifty of a tested sample rather than of the market — the funnel under the '
      + 'table says how many companies the universe held and how many were actually measured.',
  },

  /* ==========================================================================
     The one screen on this page that is not built on our own opinion
     ========================================================================== */

  {
    key: 'top-wallstreet-stocks',
    group: 'Ranked portfolios',
    title: 'Top WallStreet Stocks',
    tag: 'Analyst rated',
    ranked: true,
    resultLimit: 30,
    thesis: 'What the sell side likes best. Analysts covering the company are tallied — strong '
      + 'buy through strong sell — and the tally is ranked. Eligibility is real coverage and a '
      + 'bullish balance; the ranking is their average, not ours.',
    universe: { ...LISTED, marketCapMoreThan: 2 * BILLION },
    // A ranked idea infers no bags from its rules, so the ranking feed has to
    // be asked for outright.
    bags: ['grades'],
    rules: [
      atLeast('Covered by at least 10 analysts', F.analystCount, 10),
      atLeast('More than half rate it buy or better', F.analystBuyShare, 0.50),
    ],
    sort: (c) => F.analystScore(c) ?? -1,
    sortLabel: 'analyst rating',
    columns: ['analystScore', 'analystCount', 'analystBuyShare'],
    note: 'This is the one screen here that ranks on somebody else’s opinion, and the distinction '
      + 'matters more than it looks. Every other score in this product is a percentile of '
      + 'measurable ratios against a sector; this is a count of published recommendations put on '
      + 'the same 0-5 scale so it can be sorted. A 4.2 here means analysts are bullish, not that '
      + 'the company ranks well on anything. '
      + 'Two known biases come with it. Sell-side ratings skew bullish — sell recommendations are '
      + 'rare across the whole market, so "more than half rate it buy" is a low bar rather than a '
      + 'high one. And coverage itself is not random: large, liquid, heavily traded companies '
      + 'attract more analysts, so a coverage floor of ten is also, quietly, a size filter. The '
      + 'ten-analyst minimum is there because a mean of three opinions is not a consensus.',
  },
];

export const IDEA_BY_KEY = Object.fromEntries(IDEAS.map((i) => [i.key, i]));

/**
 * Section order on the index — `IDEA_GROUPS`, which lives in `nav.js`.
 *
 * It moved there when Investment Ideas became a top-level rail menu: the rail
 * builds one menu item per group and the router accepts one slug per group, so
 * the list is a *destination vocabulary* and belongs beside `SECTORS` for
 * exactly the same reason. A group renamed here and not there would be a menu
 * item opening an empty page.
 *
 * An idea whose `group` is missing from the list still renders, under "More".
 */
const GROUP_ORDER = IDEA_GROUPS;

export function groupedIdeas() {
  const seen = new Map();
  for (const idea of IDEAS) {
    const g = idea.group || 'More';
    if (!seen.has(g)) seen.set(g, []);
    seen.get(g).push(idea);
  }
  const ordered = GROUP_ORDER.filter((g) => seen.has(g));
  const rest = [...seen.keys()].filter((g) => !GROUP_ORDER.includes(g));
  return [...ordered, ...rest].map((name) => ({ name, ideas: seen.get(name) }));
}

/**
 * Every bag an idea needs: the two every score column needs, whatever its
 * rules read, and anything it asks for outright.
 *
 * The last of those is for ranked ideas, which have no rules to infer from —
 * they filter on the universe alone and then sort on the composite score, so
 * they have to say which feeds that score should be built from.
 */
export function bagsFor(idea) {
  const out = new Set(BASE_BAGS);
  for (const r of idea.rules) for (const b of r.needs || []) out.add(b);
  for (const b of idea.bags || []) out.add(b);
  return [...out];
}

/**
 * How many candidates this idea can afford, given what it has to fetch.
 *
 * An idea may raise its own budget. That is not a convenience: candidates are
 * taken largest first, so a screen looking for something the largest companies
 * rarely have — cheapness, most obviously — is sampling against itself, and
 * the only fix available is to sample deeper.
 */
export function capFor(idea) {
  const perCandidate = Math.max(bagsFor(idea).length, 1);
  const budget = idea.budget || REQUEST_BUDGET;
  return Math.min(MAX_CANDIDATES,
    Math.max(MIN_CANDIDATES, Math.floor(budget / perCandidate)));
}

/* ==========================================================================
   Columns

   What each idea shows beside the score. Defined once, referenced by key from
   an idea's `columns`, so two ideas asking about the same ratio print it the
   same way.
   ========================================================================== */

const COLUMNS = {
  pe: { label: 'P/E', get: F.pe, fmt: (v) => mult(v) },
  pb: { label: 'P/B', get: F.pb, fmt: (v) => mult(v) },
  peg: { label: 'PEG', get: F.peg, fmt: (v) => mult(v) },
  evToEbitda: { label: 'EV/EBITDA', get: F.evToEbitda, fmt: (v) => mult(v) },
  roic: { label: 'ROIC', get: F.roic, fmt: (v) => pct(v) },
  roe: { label: 'ROE', get: F.roe, fmt: (v) => pct(v) },
  grossMargin: { label: 'Gross margin', get: F.grossMargin, fmt: (v) => pct(v) },
  operatingMargin: { label: 'Operating margin', get: F.operatingMargin, fmt: (v) => pct(v) },
  netMargin: { label: 'Net margin', get: F.netMargin, fmt: (v) => pct(v) },
  dividendYield: { label: 'Yield', get: F.dividendYield, fmt: (v) => pct(v, { dp: 2 }) },
  payout: { label: 'Payout', get: F.payout, fmt: (v) => pct(v, { dp: 0 }) },
  netDebtToEbitda: { label: 'Net debt/EBITDA', get: F.netDebtToEbitda, fmt: (v) => mult(v) },
  debtToEquity: { label: 'Debt/equity', get: F.debtToEquity, fmt: (v) => mult(v) },
  currentRatio: { label: 'Current ratio', get: F.currentRatio, fmt: (v) => mult(v) },
  interestCover: { label: 'Interest cover', get: F.interestCover, fmt: (v) => mult(v) },
  fcfYield: { label: 'FCF yield', get: F.fcfYield, fmt: (v) => pct(v) },
  incomeQuality: { label: 'Cash conversion', get: F.incomeQuality, fmt: (v) => mult(v) },
  capexToRevenue: { label: 'Capex/revenue', get: F.capexToRevenue, fmt: (v) => pct(v) },
  rdToRevenue: { label: 'R&D/revenue', get: F.rdToRevenue, fmt: (v) => pct(v) },
  assetTurnover: { label: 'Asset turnover', get: F.assetTurnover, fmt: (v) => mult(v) },
  revenueGrowth: { label: 'Revenue growth', get: F.revenueGrowth, fmt: (v) => pct(v, { sign: true }) },
  epsGrowth: { label: 'EPS growth', get: F.epsGrowth, fmt: (v) => pct(v, { sign: true }) },
  discount: { label: 'Below fair value', get: F.discount, fmt: (v) => pct(v) },
  insiderNet: { label: 'Net shares bought', get: F.insiderNet, fmt: (v) => num(v, 0) },
  closelyHeld: { label: 'Closely held', get: F.closelyHeld, fmt: (v) => pct(v) },
  fwdEpsGrowth: { label: 'Forecast EPS growth', get: F.fwdEpsGrowth, fmt: (v) => pct(v, { sign: true }) },
  fwdRevenueGrowth: { label: 'Forecast revenue growth', get: F.fwdRevenueGrowth, fmt: (v) => pct(v, { sign: true }) },
  analysts: { label: 'Analysts', get: F.analysts, fmt: (v) => String(v) },
  return1y: { label: '1-year return', get: F.return1y, fmt: (v) => pct(v, { sign: true }) },
  return6m: { label: '6-month return', get: F.return6m, fmt: (v) => pct(v, { sign: true }) },
  drawdown: { label: 'Worst fall', get: F.drawdown, fmt: (v) => pct(v) },

  /* Added with the screener. Each was already a field on `F` and already
     screened on by at least one idea; they simply had no column, which meant
     the picker could not offer them either. */
  ps: { label: 'P/S', get: F.ps, fmt: (v) => mult(v) },
  analystScore: { label: 'Analyst rating', get: F.analystScore, fmt: (v) => dec(v, 2) },
  analystCount: { label: 'Analysts covering', get: F.analystCount, fmt: (v) => num(v, 0) },
  analystBuyShare: { label: 'Buy or better', get: F.analystBuyShare, fmt: (v) => pct(v, { dp: 0 }) },
  insiderBought: { label: 'Shares bought by insiders', get: F.insiderBought, fmt: (v) => num(v, 0) },
  fcfGrowth: { label: 'FCF growth', get: F.fcfGrowth, fmt: (v) => pct(v, { sign: true }) },
  fcfToOcf: { label: 'FCF/operating cash flow', get: F.fcfToOcf, fmt: (v) => mult(v) },
};

/* ==========================================================================
   The filter registry

   `COLUMNS` above already knew, for thirty-odd metrics, what to call them and
   how to print them. A screener needs two more facts per metric — which group
   it belongs in on the picker, and what kind of number it is so an input can
   show `10` and store `0.10` — so those are merged onto the same entries
   rather than written into a second list that would drift from the first.

   `kind` drives the input, not the display:

     pct     stored 0.10, typed as 10, suffixed %
     mult    stored 20,   typed as 20, suffixed ×
     score   stored 4,    typed as 4,  suffixed / 5
     count   stored raw
     money   stored 1e9,  typed as 1,  suffixed b

   A metric with no entry here is still a column; it is just not offered in the
   picker, which is the right default for anything whose units would confuse
   more than they help.
   ========================================================================== */

/** metric key -> [picker group, input kind]. */
const FILTER_META = {
  pe: ['Valuation', 'mult'],
  pb: ['Valuation', 'mult'],
  ps: ['Valuation', 'mult'],
  peg: ['Valuation', 'mult'],
  evToEbitda: ['Valuation', 'mult'],
  fcfYield: ['Valuation', 'pct'],
  discount: ['Valuation', 'pct'],

  revenueGrowth: ['Growth', 'pct'],
  epsGrowth: ['Growth', 'pct'],
  fcfGrowth: ['Growth', 'pct'],
  fwdEpsGrowth: ['Growth', 'pct'],
  fwdRevenueGrowth: ['Growth', 'pct'],

  grossMargin: ['Profitability', 'pct'],
  operatingMargin: ['Profitability', 'pct'],
  netMargin: ['Profitability', 'pct'],
  roe: ['Profitability', 'pct'],
  roic: ['Profitability', 'pct'],
  incomeQuality: ['Profitability', 'mult'],
  fcfToOcf: ['Profitability', 'mult'],
  assetTurnover: ['Profitability', 'mult'],

  currentRatio: ['Financial health', 'mult'],
  debtToEquity: ['Financial health', 'mult'],
  interestCover: ['Financial health', 'mult'],
  netDebtToEbitda: ['Financial health', 'mult'],

  dividendYield: ['Dividends', 'pct'],
  payout: ['Dividends', 'pct'],

  return1y: ['Momentum', 'pct'],
  return6m: ['Momentum', 'pct'],
  drawdown: ['Momentum', 'pct'],

  capexToRevenue: ['Spending', 'pct'],
  rdToRevenue: ['Spending', 'pct'],

  insiderNet: ['Ownership', 'count'],
  insiderBought: ['Ownership', 'count'],
  closelyHeld: ['Ownership', 'pct'],
  analysts: ['Coverage', 'count'],
  analystScore: ['Wall Street', 'score'],
  analystCount: ['Wall Street', 'count'],
  analystBuyShare: ['Wall Street', 'pct'],
};

for (const [key, col] of Object.entries(COLUMNS)) {
  col.key = key;
  const m = FILTER_META[key];
  if (m) { [col.group, col.kind] = m; }
}

/**
 * The five factor scores, as filterable metrics.
 *
 * Namespaced `score:<key>` because a factor named `growth` would otherwise
 * collide with the growth ratio. `score:overall` is the composite — the one
 * thing a reader most often wants to screen on and the one `scoreAtLeast`
 * could not express, because it takes a factor key.
 */
export const SCORE_METRICS = Object.fromEntries([
  ...FACTOR_KEYS.map((k) => [`score:${k}`, {
    key: `score:${k}`,
    label: `${FACTOR_BY_KEY[k].title} score`,
    group: 'Our scores',
    kind: 'score',
    factor: k,
    fmt: (v) => dec(v, 2),
  }]),
  ['score:overall', {
    key: 'score:overall',
    label: 'Overall score',
    group: 'Our scores',
    kind: 'score',
    factor: null,
    fmt: (v) => dec(v, 2),
  }],
]);

/** Everything the picker can offer, by key. */
export const FILTER_METRICS = {
  ...SCORE_METRICS,
  ...Object.fromEntries(Object.entries(COLUMNS).filter(([, c]) => c.group)),
};

/** Picker group order. Our own scores first — they are what this product has. */
const FILTER_GROUP_ORDER = [
  'Our scores', 'Wall Street', 'Valuation', 'Growth', 'Profitability',
  'Financial health', 'Dividends', 'Momentum', 'Ownership', 'Spending', 'Coverage',
];

/** The picker's contents: `[{ name, metrics: [...] }]`, in order. */
export function filterGroups() {
  const byGroup = new Map();
  for (const m of Object.values(FILTER_METRICS)) {
    if (!byGroup.has(m.group)) byGroup.set(m.group, []);
    byGroup.get(m.group).push(m);
  }
  const ordered = FILTER_GROUP_ORDER.filter((g) => byGroup.has(g));
  const rest = [...byGroup.keys()].filter((g) => !FILTER_GROUP_ORDER.includes(g));
  return [...ordered, ...rest].map((name) => ({ name, metrics: byGroup.get(name) }));
}

/* ---------- turning a filter into a number a person can type ---------------- */

/** Stored value -> what goes in the input box. */
export function filterToInput(kind, v) {
  if (!isNum(v)) return '';
  if (kind === 'pct') return String(Number((v * 100).toFixed(4)));
  if (kind === 'money') return String(Number((v / BILLION).toFixed(4)));
  return String(Number(v.toFixed(4)));
}

/** What was typed -> the value the rule tests against. */
export function inputToFilter(kind, raw) {
  const n = parseFloat(String(raw).replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(n)) return null;
  if (kind === 'pct') return n / 100;
  if (kind === 'money') return n * BILLION;
  return n;
}

/** The suffix printed beside the input, so the unit is never guessed. */
export const filterUnit = (kind) =>
  ({ pct: '%', mult: '×', score: `/ ${MAX_SCORE}`, money: 'b', count: '' }[kind] ?? '');

/* ---------- descriptor -> rule ---------------------------------------------- */

const OP_WORD = { gte: 'at least', lte: 'at most', between: 'between' };

/** The sentence a rebuilt rule prints in the pass breakdown. */
export function filterLabel(f) {
  const m = FILTER_METRICS[f.metric];
  if (!m) return 'Unknown filter';
  const show = (v) => `${filterToInput(m.kind, v)}${filterUnit(m.kind)}`;
  if (f.op === 'between') return `${m.label} between ${show(f.value[0])} and ${show(f.value[1])}`;
  return `${m.label} ${OP_WORD[f.op] || f.op} ${show(f.value)}`;
}

/**
 * A filter descriptor back into a runnable rule.
 *
 * The inverse of what the builders above attach. Returns null for a metric the
 * registry does not know, and the caller drops it — a screen that silently
 * ignores a filter the reader can see is worse than one that never offered it.
 *
 * Note the label is **regenerated**, not carried across. A rule whose number
 * the reader changed must not keep describing the number it used to test, and
 * that is exactly the bug a preserved label would produce.
 */
export function ruleFromFilter(f) {
  const m = FILTER_METRICS[f?.metric];
  if (!m || f.value == null) return null;
  const label = filterLabel(f);

  if (m.kind === 'score') {
    const needs = m.factor ? (LITE_SOURCES[m.factor] || BASE_BAGS) : BASE_BAGS;
    const read = (c) => (m.factor ? c.lite?.factors?.[m.factor]?.score : c.lite?.score);
    // A company the screen could not measure fails, exactly as `scoreAtLeast`
    // has it: null is not a low score, and a screen asking for 4 out of 5 must
    // not quietly admit the companies it knows nothing about.
    return rule(label, needs, (c) => {
      const v = read(c);
      if (!isNum(v)) return false;
      if (f.op === 'lte') return v <= f.value;
      if (f.op === 'between') return v >= f.value[0] && v <= f.value[1];
      return v >= f.value;
    }, f);
  }

  const get = m.get;
  if (typeof get !== 'function') return null;
  if (f.op === 'lte') return atMost(label, get, f.value, { allowNegative: f.allowNegative });
  if (f.op === 'between') return between(label, get, f.value[0], f.value[1]);
  return atLeast(label, get, f.value);
}

/**
 * A portfolio, re-expressed with the reader's edits.
 *
 * Returns the same shape `runIdea` already takes, so the engine never learns
 * that a screen was edited: a derived idea is an idea. `edited` is carried so
 * the page can say whether what ran is still the published portfolio.
 */
export function ideaFromFilters(idea, { universe = {}, filters = [] } = {}) {
  // `f.rule` is the original, carried across for anything the panel could not
  // turn into controls. See `filtersFor` for why it is never simply dropped.
  const rules = filters.map((f) => (f.fixed ? f.rule : ruleFromFilter(f))).filter(Boolean);
  return {
    ...idea,
    universe: { ...idea.universe, ...universe },
    rules,
    // A ranked portfolio with every rule removed is still ranked — the ranking
    // is the screen. A rule-based one with none left is the whole universe by
    // market cap, which is a legitimate thing to ask for and the closest this
    // product has to a blank screener.
    edited: true,
  };
}

/**
 * The published rules of a portfolio, as filter descriptors the panel can edit.
 *
 * **Every rule comes back, editable or not.** A rule with no descriptor — or
 * one naming a metric the registry does not carry — returns as `fixed: true`
 * with the original rule attached, and `ideaFromFilters` runs that rule
 * verbatim.
 *
 * That is the load-bearing guarantee here, and it is worth stating why: a
 * dropped rule makes the derived screen *looser* than the published one, so
 * the page would quietly return companies that do not pass the portfolio it
 * claims to be running. A rule shown as "not adjustable" is a small
 * disappointment; a rule silently not applied is a wrong answer.
 */
export function filtersFor(idea) {
  return (idea.rules || []).map((r, i) => {
    const usable = r.filter && FILTER_METRICS[r.filter.metric];
    return usable
      ? { ...r.filter, id: `f${i}`, label: r.label }
      : { id: `f${i}`, fixed: true, label: r.label, rule: r };
  });
}

/* ==========================================================================
   Deduplication

   The screener returns listings, and an idea wants companies. Two things make
   those differ:

     - **A second listing of the same shares.** `NVDA.NE` is NVDA on Cboe
       Canada. Same company, same economics, different row.
     - **A second share class.** `GOOG` beside `GOOGL`, `BRK-A` beside
       `BRK-B` — one business, two lines, and both pass or fail together.

   Either takes a slot in the tested sample away from a company not already in
   it, which is the real cost: at a cap of three hundred, a hundred duplicate
   listings is a third of the screen spent re-testing names it already has.
   ========================================================================== */

/** Legal and share-class wording that does not distinguish two companies. */
const NAME_NOISE = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'plc', 'ltd',
  'limited', 'sa', 'nv', 'ag', 'llc', 'lp', 'holdings', 'holding', 'group',
  'the', 'class', 'a', 'b', 'c', 'series', 'cl', 'ordinary', 'shares', 'common',
  'stock', 'adr', 'ads', 'new',
]);

function companyKey(name) {
  const words = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NAME_NOISE.has(w));
  return words.join(' ');
}

/** The ticker without its exchange suffix: `NVDA.NE` -> `NVDA`. */
const baseSymbol = (sym) => String(sym || '').split('.')[0];

/**
 * One row per company, keeping the biggest and plainest listing of each.
 *
 * Preference inside a group: a symbol with no exchange suffix beats one with a
 * suffix, and after that the larger market capitalisation wins. That keeps
 * `NVDA` over `NVDA.NE`, and the heavier of `GOOGL` and `GOOG`.
 *
 * The name pass runs second and is the riskier of the two — two genuinely
 * different companies could normalise to the same words. It is worth it
 * because share classes share no ticker at all, and the count it removes is
 * printed under every result so a wrong merge is at least visible.
 *
 * Exported so it can be exercised directly. It is pure, it decides which
 * companies a screen is even allowed to see, and it is the one part of this
 * module that can be checked without an API key.
 */
export function dedupe(rows) {
  const pick = (a, b) => {
    const aSuffixed = a.symbol.includes('.');
    const bSuffixed = b.symbol.includes('.');
    if (aSuffixed !== bSuffixed) return aSuffixed ? b : a;
    return (b.marketCap ?? 0) > (a.marketCap ?? 0) ? b : a;
  };

  const collapse = (list, keyOf) => {
    const best = new Map();
    for (const r of list) {
      const k = keyOf(r);
      if (!k) continue;
      best.set(k, best.has(k) ? pick(best.get(k), r) : r);
    }
    return [...best.values()];
  };

  const byTicker = collapse(rows, (r) => baseSymbol(r.symbol));
  return collapse(byTicker, (r) => companyKey(r.companyName) || baseSymbol(r.symbol));
}

/* ==========================================================================
   Running one idea
   ========================================================================== */

/**
 * Screen, deduplicate, enrich, test, score, rank.
 *
 * `onProgress(done, total)` is called as the candidate pulls land, so the
 * caller can show something moving through what is otherwise a long silence.
 *
 * The result reports the whole funnel — listings returned, companies after
 * deduplication, companies tested, companies passed — because a headline of
 * "eight companies" means nothing without the three numbers above it.
 */
export async function runIdea(idea, { onProgress } = {}) {
  const hits = await fetchScreener(idea.universe);
  if (hits.status !== 'ok') return { state: hits.status, message: hits.message, idea };

  const listings = hits.data.filter((h) => h.symbol && !h.isEtf && !h.isFund);
  const universe = dedupe(listings);
  if (!universe.length) {
    return { state: 'empty', idea, listings: listings.length, universeSize: 0, tested: 0, rows: [] };
  }

  const bags = bagsFor(idea);
  const cap = capFor(idea);

  // Largest first, then capped. Size is the only ranking the screener gives us
  // for free, and it is at least a defensible one: the names most readers have
  // heard of get tested, and the tail is stated rather than hidden.
  const candidates = [...universe]
    .sort((x, y) => (y.marketCap ?? 0) - (x.marketCap ?? 0))
    .slice(0, cap);

  const stats = await loadSectorStats();
  const lookups = new Map();
  const lookupFor = (sector) => {
    if (!lookups.has(sector)) lookups.set(sector, sectorLookup(stats, sector));
    return lookups.get(sector);
  };

  // Thirteen months, not the six years `fetchFor` defaults to: the longest
  // window any momentum metric looks at is a year, and six years of daily
  // closes for three hundred companies is a payload nobody reads.
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);

  let done = 0;
  const rows = await mapLimited(candidates, async (h) => {
    const results = await Promise.all(bags.map((bag) => fetchFor(
      BAG_FEED[bag], h.symbol, bag === 'returns' ? { from } : {},
    )));
    onProgress?.(++done, candidates.length);

    const c = {
      symbol: h.symbol,
      name: h.companyName || h.symbol,
      sector: h.sector || '',
      industry: h.industry || '',
      marketCap: isNum(h.marketCap) ? h.marketCap : null,
      price: isNum(h.price) ? h.price : null,
      volume: isNum(h.volume) ? h.volume : null,
      beta: isNum(h.beta) ? h.beta : null,
      lastAnnualDividend: isNum(h.lastAnnualDividend) ? h.lastAnnualDividend : null,
      exchange: h.exchangeShortName || h.exchange || '',
      country: h.country || '',
    };
    for (const bag of Object.keys(BAG_FEED)) c[bag] = null;

    bags.forEach((bag, i) => {
      const r = results[i];
      if (r.status !== 'ok' || r.data == null) return;
      const shape = BAG_SHAPE[bag];
      c[bag] = shape ? shape(r.data, h) : r.data;
    });

    c.lite = scoreLite(c, lookupFor(c.sector));
    c.passes = idea.rules.map((rl) => rl.test(c));
    c.passed = c.passes.every(Boolean);
    return c;
  }, 6);

  const winners = rows
    .filter((c) => c.passed)
    .sort((x, y) => (idea.sort(y) ?? -1) - (idea.sort(x) ?? -1))
    .slice(0, idea.resultLimit || RESULT_CAP);

  return {
    state: 'ok',
    idea,
    listings: listings.length,
    universeSize: universe.length,
    tested: candidates.length,
    cap,
    feedsPer: bags.length,
    passedCount: rows.filter((c) => c.passed).length,
    resultLimit: idea.resultLimit || RESULT_CAP,
    rows: winners,
    /* Kept so the rules card can say which rule did the excluding — "nothing
       passed" is a far worse answer than "eleven of the twelve failed on the
       P/E test alone". */
    all: rows,
  };
}

/* ==========================================================================
   The index page
   ========================================================================== */

/* The index that used to live here — a column of twenty-three tall cards —
   was replaced by the directory in `portfolios.js` when Investment Ideas
   became a top-level rail menu. Same twenty-three portfolios, same groups,
   same rules, same run; a layout to scan rather than to read. `universeLine`
   below is the one piece of it that survived, because two surfaces print it.

   `renderIdeaResult` is NOT superseded: `screens.js` renders the Stocks,
   Quant and Shariah menu screens through it, and those are not portfolios. */

/**
 * The server-side half of a screen, in words.
 *
 * Survived the index it was written for, because three surfaces print it now:
 * `rulesListCard` below, the portfolio tiles, and the screener panel. Exported
 * for the last two.
 */
export function universeLine(idea) {
  const u = idea.universe;
  const bits = [];
  if (u.industry) bits.push(u.industry);
  if (u.sector) bits.push(u.sector);
  if (isNum(u.marketCapMoreThan) && isNum(u.marketCapLowerThan)) {
    bits.push(`${money(u.marketCapMoreThan)}–${money(u.marketCapLowerThan)}`);
  } else if (isNum(u.marketCapMoreThan)) {
    bits.push(`over ${money(u.marketCapMoreThan)}`);
  } else if (isNum(u.marketCapLowerThan)) {
    bits.push(`under ${money(u.marketCapLowerThan)}`);
  }
  if (isNum(u.priceMoreThan)) bits.push(`over $${u.priceMoreThan} a share`);
  if (isNum(u.volumeMoreThan)) bits.push(`${num(u.volumeMoreThan, 0)}+ daily volume`);
  if (isNum(u.dividendMoreThan)) bits.push('pays a dividend');
  bits.push('US-listed operating companies');
  return `Universe: ${bits.join(' · ')}.`;
}

/* ==========================================================================
   One idea's results
   ========================================================================== */

export function renderIdeaResult(result, nav = {}) {
  const idea = result.idea;

  return el('div', { class: 'shell shell--wide' }, [
    el('div', { class: 'ideashead' }, [
      el('button', {
        type: 'button', class: 'omore omore--back',
        text: 'All investment ideas',
        onclick: () => nav.openIdeas?.(),
      }),
      el('h1', { text: idea.title }),
      el('p', { text: idea.thesis }),
    ]),

    el('div', { class: 'ovw' }, [
      resultCard(result, nav),
      // A ranked idea has no rules to break down; the others only get the
      // breakdown when something was actually tested, because "0 of 0 passed
      // this rule" on a screen that never ran reads as a result and is not one.
      idea.ranked
        ? rankedCard(result)
        : (result.state === 'ok' && result.all?.length
            ? rulesCard(result) : rulesListCard(idea)),
      basisCard(result),
    ]),
  ]);
}

export function resultCard(result, nav) {
  const idea = result.idea;

  if (result.state !== 'ok') {
    const message = {
      gated: 'The company screener is not included in your current FMP plan, so this idea cannot '
        + 'be run. The rest of the report is unaffected.',
      skipped: 'This screen needs a live FMP connection. Add your API key under the gear icon.',
      empty: 'The screener returned no companies for this idea’s universe. That is a filter '
        + 'question rather than a market one — the size floor or the sector is excluding '
        + 'everything before a single rule is tested.',
    }[result.state]
      || `The screen could not be run — ${esc(result.message || 'unknown error')}.`;

    return card('idea-result', [
      ohead('Results'),
      notice(message, result.state === 'error' ? 'notice--error' : ''),
    ], 'ocard ovw__c12');
  }

  const cols = (idea.columns || []).map((k) => COLUMNS[k]).filter(Boolean);

  // A score screen prints all five factors rather than three ratios: the whole
  // claim is about the scores, and the four it did not test are the context a
  // reader needs to judge the one it did.
  const factorCols = idea.scoreIdea ? FACTOR_KEYS : [];

  const headers = [
    { label: 'Company' },
    { label: 'Market cap', num: true },
    ...cols.map((c) => ({ label: c.label, num: true })),
    ...factorCols.map((k) => ({ label: FACTOR_BY_KEY[k].title, num: true })),
    { label: 'Overall', num: true },
  ];

  const body = result.rows.map((c) => [
    el('button', {
      type: 'button', class: 'idearow', title: `Open the full ${c.symbol} report`,
      onclick: () => nav.openSymbol?.(c.symbol),
    }, [
      el('b', { text: c.symbol }),
      el('span', { class: 'idearow__n', text: c.name }),
      el('span', { class: 'idearow__s', text: c.industry || c.sector || '' }),
    ]),
    money(c.marketCap),
    ...cols.map((col) => {
      const v = col.get(c);
      return isNum(v) ? col.fmt(v) : 'n/a';
    }),
    ...factorCols.map((k) => factorCell(c.lite?.factors?.[k])),
    el('span', { class: 'ideascore' }, [
      gradePill(c.lite?.score, letterFor(c.lite?.score)),
      el('i', { text: c.lite?.scoredOn ? `${c.lite.scoredOn} ratios` : 'not scored' }),
    ]),
  ]);

  return card('idea-result', [
    ohead(idea.ranked
      ? `${result.rows.length} holding${result.rows.length === 1 ? '' : 's'}`
      : `${result.rows.length} compan${result.rows.length === 1 ? 'y' : 'ies'} pass`,
      el('span', { class: 'pill pill--gold', text: `sorted by ${idea.sortLabel}` }),
      'Click a row to open that company’s full report. Every score here is the reduced one — up '
      + `to ${LITE_TOTAL} ratios against the company’s own sector, where a Ratings tab grades 77 `
      + 'off a full pull. The number under each score is how many it actually managed.'),

    result.rows.length
      ? table(headers, body)
      : notice('No company in the tested sample passed all of this idea’s rules. The card '
        + 'below shows which rule did most of the excluding.'),

    el('p', { class: 't-tiny subtle mt2', text: funnelLine(result) }),
  ], 'ocard ovw__c12');
}

/** The whole funnel in one sentence. The headline count means little alone. */
function funnelLine(result) {
  const dropped = result.listings - result.universeSize;
  return `FMP returned ${result.listings} listings matching the universe`
    + (dropped > 0
      ? `, of which ${dropped} were a second listing or share class of a company already in the `
        + `set — leaving ${result.universeSize} companies. `
      : `, which deduplicated to ${result.universeSize} companies. `)
    + `The largest ${result.tested} were pulled, ${result.feedsPer} feeds each, and `
    + (result.idea.ranked
      ? `ranked on ${result.idea.sortLabel} — the top ${result.rows.length} are held. `
      : `tested against the rules. ${result.passedCount} passed, and the top `
        + `${result.rows.length} by ${result.idea.sortLabel} are shown. `)
    + `Companies past the first ${result.cap} were never scored, so this is the best of a `
    + 'sample rather than the best of the market.';
}

/** One factor's score, with the count of ratios behind it underneath. */
function factorCell(f) {
  if (!f || !isNum(f.score)) return el('span', { class: 'subtle', text: 'n/a' });
  return el('span', { class: 'ideascore' }, [
    gradePill(f.score, letterFor(f.score)),
    el('i', { text: String(f.scoredOn) }),
  ]);
}

/**
 * Which rule did the excluding.
 *
 * A screen returning three names looks like a strict screen; it is more often
 * one rule doing all the work. Counting failures per rule turns "only three
 * passed" into something the reader can argue with — and something whoever
 * edits `IDEAS` can act on.
 */
/** The rules alone, for a screen that has not run. */
/**
 * What a ranked idea did, since it has no rules to break down.
 *
 * The distinction this card exists to draw: the eligibility filters are
 * ordinary screening and are reproduced exactly, and the ranking is this
 * report's own composite and is nobody else's model. A reader holding these
 * fifteen names against a published portfolio needs to know which half is
 * which.
 */
export function rankedCard(result) {
  const idea = result.idea;
  const u = idea.universe;

  const filters = [
    ['Sector', u.sector || 'any'],
    ['Region', 'United States'],
    ['Market capitalisation', isNum(u.marketCapMoreThan) && isNum(u.marketCapLowerThan)
      ? `${money(u.marketCapMoreThan)} to ${money(u.marketCapLowerThan)}`
      : isNum(u.marketCapMoreThan) ? `over ${money(u.marketCapMoreThan)}` : 'any'],
    ['Share price', isNum(u.priceMoreThan) ? `over $${u.priceMoreThan}` : 'any'],
    ['Daily volume', isNum(u.volumeMoreThan) ? `over ${num(u.volumeMoreThan, 0)}` : 'any'],
    ['Holdings kept', String(idea.resultLimit)],
  ];

  return card('idea-rules', [
    ohead('Eligibility, then ranking', null,
      'Two separate steps. The first is ordinary screening and is exactly reproducible; the '
      + 'second is this report’s own composite, and is not a stand-in for anybody else’s model.'),

    el('p', { class: 'osub', text: 'Who is eligible' }),
    el('div', { class: 'ostats' }, filters.map(([k, v]) => statLine(k, v))),

    idea.rules.length ? el('p', { class: 'osub', text: 'Then filtered on' }) : null,
    idea.rules.length ? el('ul', { class: 'idearules' }, idea.rules.map((r) => el('li', {}, [
      icon('pass', 'idearules__tick'),
      el('span', { text: r.label }),
    ]))) : null,

    el('p', { class: 'osub', text: 'How the eligible are ranked' }),
    el('p', { class: 'fgroup__desc', text: 'By the overall score — the mean of every metric this '
      + 'path can grade, each one a percentile against the company’s own sector. That is a '
      + 'description of where a company stands today, not a forecast of what it does next, and '
      + 'no part of it is trained on realised returns. A published AI portfolio learns its '
      + 'weights from decades of forward performance, which is a different question; the two '
      + 'lists will differ, and neither is a check on the other.' }),

    idea.note ? el('p', { class: 't-xs soft mt2', text: idea.note }) : null,
  ], 'ocard ovw__c12');
}

export function rulesListCard(idea) {
  return card('idea-rules', [
    ohead('What this idea tests', null,
      'Each rule runs against the company’s trailing figures. All of them have to pass.'),
    el('ul', { class: 'idearules' }, idea.rules.map((r) => el('li', {}, [
      icon('pass', 'idearules__tick'),
      el('span', { text: r.label }),
    ]))),
    el('p', { class: 't-xs soft mt3', text: universeLine(idea) }),
    idea.note ? el('p', { class: 't-xs soft mt2', text: idea.note }) : null,
  ], 'ocard ovw__c12');
}

export function rulesCard(result) {
  const idea = result.idea;
  const tested = result.all || [];

  const counts = idea.rules.map((r, i) => ({
    label: r.label,
    passed: tested.filter((c) => c.passes?.[i]).length,
  }));

  return card('idea-rules', [
    ohead('The rules, and what they cost', null,
      'How many of the tested companies cleared each rule on its own. A rule that almost nobody '
      + 'passes is the one deciding the whole screen.'),

    el('div', { class: 'idearesult' }, counts.map((c) => {
      const share = tested.length ? (c.passed / tested.length) * 100 : 0;
      return el('div', { class: 'idearesult__row' }, [
        el('span', { class: 'idearesult__k', text: c.label }),
        el('span', { class: 'gradebar' }, [
          el('span', {
            class: `gradebar__fill is-${share >= 50 ? 'good' : share >= 20 ? 'mid' : 'weak'}`,
            style: { width: `${share}%` },
          }),
        ]),
        el('span', { class: 'idearesult__n', text: `${c.passed}/${tested.length}` }),
      ]);
    })),

    idea.note ? el('p', { class: 't-xs soft mt3', text: idea.note }) : null,
  ], 'ocard ovw__c12');
}

/* ==========================================================================
   What an idea is, and is not
   ========================================================================== */

export function basisCard(result) {
  const depth = FACTOR_KEYS.map((k) => `${FACTOR_BY_KEY[k].title} ${LITE_DEPTH[k] || 0}`).join(' · ');

  return card('idea-basis', [
    ohead('How these screens work'),

    el('div', { class: 'ostats' }, [
      statLine('Universe', 'FMP company screener', { note: 'size, sector, country' }),
      statLine('Duplicate listings', 'Removed', { note: 'one row per company' }),
      statLine('Request budget per idea', `~${REQUEST_BUDGET}`, {
        note: `${MIN_CANDIDATES}–${MAX_CANDIDATES} companies, by feeds needed`,
      }),
      statLine('Score', 'Reduced, sector-relative', { note: `0–${MAX_SCORE}, up to ${LITE_TOTAL} ratios` }),
      statLine('Ratios per factor', depth, { note: 'at best, on this path' }),
    ]),

    el('p', { class: 'osub', text: 'What a result does not mean' }),
    el('ul', { class: 'rlimits' }, [
      'It is not the best of the market. The vendor screens on size and sector but not on '
        + 'ratios, so every rule runs on a sample taken largest first. A company below the cap '
        + 'is never tested, however well it would have scored.',
      'The scores are the reduced ones. A factor graded here on six ratios and the same factor '
        + 'graded on a Ratings tab from twenty-four share a scale and a set of sector '
        + 'distributions, but they are not the same measurement — the count beside each score '
        + 'is what keeps the two apart.',
      'A company that could not be measured on a factor fails any rule about it rather than '
        + 'passing. That is deliberate, and it means a thinly covered company can be missing '
        + 'from a screen it would have passed.',
      'Deduplication is a judgement. Second listings are matched on the ticker before its '
        + 'exchange suffix, and share classes on a normalised company name — which could in '
        + 'principle merge two genuinely different companies. The count removed is printed '
        + 'under every result so that a wrong merge is at least visible.',
      'Every rule is a trailing figure. Nothing here knows what a company announced last week, '
        + 'and nothing here is a forecast.',
      'The ideas are editorial. The thresholds are round numbers chosen because they are '
        + 'defensible, not because they were backtested — this repo runs no backtest.',
      'Passing a screen is a reason to open the report, not a reason to buy anything. None of '
        + 'this is investment advice.',
    ].map((text) => el('li', { text }))),

    result ? null : el('p', { class: 't-tiny subtle mt2', text: 'An idea costs one screener call '
      + 'plus two to four requests per company tested. The exact figure for each is on its Run '
      + 'button.' }),
  ], 'ocard ovw__c12');
}
