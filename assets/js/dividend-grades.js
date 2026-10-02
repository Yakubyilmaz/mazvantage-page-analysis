/* ==========================================================================
   Vanlior — the dividend composites, in the report's own grade design

   The four composites from `dividend-score.js`, rendered with exactly the
   parts the five graded factors use: the score panel with its pill and grade
   bar, the subtopic summary strip, and the five-column ratio table —

     Ratio | SYM | Sector Median | Sector Ranking | Sector Relative Grade

   — with a sentence under every row saying what the figure means and where it
   ranked. Nothing here draws its own table. `gradeTable` and
   `subtopicSummary` are imported from `gradeview.js` and the metric objects
   are shaped to match, so a reader who has learned one ratio table has
   learned this one.

   ---------------------------------------------------------------------------
   What still differs, and has to
   ---------------------------------------------------------------------------

   - The **universe is payers only**, ranked against payers. A non-payer is
     outside it rather than last in it.
   - The **scale runs 1 to 5**, not 0 to 5, so the grade bar never empties.
   - A composite is a **weighted** average of its lines, not a mean, and a
     line that could not be computed is dropped with its weight renormalised
     across the survivors. The score panel prints how much of the designed
     weight actually computed rather than a confidence adjective.
   - There is **no overall dividend grade**, and the overview says why in a
     sentence rather than leaving a reader to wonder what is missing.

   ---------------------------------------------------------------------------
   And no spoke on the flake
   ---------------------------------------------------------------------------

   The snowflake has five axes because the quant composite has five factors,
   and the dividend module is not a sixth. It ranks a different universe on a
   different scale from a different table, and nothing in `scores` reads it.
   So the dividend sections carry the score panel and no flake: adding a wedge
   would claim the average of six meant something.
   ========================================================================== */

import { el, isNum, dec, trim } from './util.js';
import { card, blockEl, notice } from './ui.js';
import { gradePill, gradeTable, subtopicSummary } from './gradeview.js';
import { toneForLetter } from './grading.js';
import { DIV_FACTORS, DIV_LINE_BY_ID, DIV_GROUP_NOTES } from './dividend-lines.js';
import { loadDividendStats, scoreDividends, DIV_MAX } from './dividend-score.js';
import { loadDividendFeeds } from './dividend-model.js';

/* ==========================================================================
   Loading the four composites

   One entry point for both surfaces. The payer table is a single shared fetch
   per page load; the two quarterly statements are two requests that only a
   reader who reached one of these surfaces pays for.
   ========================================================================== */

export function loadDividendScores(a) {
  return Promise.all([
    loadDividendStats(),
    loadDividendFeeds(a.facts?.symbol || a.ds?.symbol, a.ds),
  ]).then(([stats, feeds]) => scoreDividends(a, stats, { feeds }));
}

/* ==========================================================================
   A dividend line, as a graded metric

   The adapter. Everything `gradeTable`, `subtopicSummary` and `rankBar` read
   off a metric is set here, so neither of them needs to know which model
   produced the row.
   ========================================================================== */

/**
 * The chip beside a line's name.
 *
 * Two of the sixty-four lines stand in for feeds that do not exist and a few
 * more are computed on a narrower definition than the specification asks for.
 * A caveat that belongs to the figure belongs beside the figure's name, not
 * only in a disclosure three screens down.
 */
function tagFor(l) {
  if (l.workaround === 'A') {
    return {
      text: 'Indicated rate',
      title: 'Uses the indicated forward rate: the latest declared payment annualised at its own '
        + 'cadence. Not an analyst forecast — no dividend-estimate feed exists in this data source.',
    };
  }
  if (l.workaround === 'B') {
    return {
      text: 'Modelled forward',
      title: 'Uses a modelled forward cash flow: the consensus earnings estimate scaled by the '
        + 'company’s own three-year cash conversion.',
    };
  }
  if (l.approximate) {
    return { text: 'Approximate', title: l.note || 'An approximation — see the note under the row.' };
  }
  return null;
}

/** How much of its factor the line is worth. Weights sum to 100 per factor. */
function weightClause(l, f) {
  if (!(l.weight > 0)) return '';
  return ` Carries ${trim(l.weight, 1)}% of the ${f.title.toLowerCase()} weighting.`;
}

/**
 * The sentence under the row.
 *
 * Built from the line's own `desc` plus the ranking clause, which is how the
 * graded factors phrase theirs — see `vs()` in `factors.js`. A line that could
 * not be computed prints its reason instead, exactly as an ungraded ratio
 * does, rather than vanishing from the table.
 */
function explainFor(l, f, r, fmt) {
  if (l.state !== 'ok') return l.why || 'Not available for this company.';

  const where = l.source === 'peers'
    ? 'the payers in its peer group'
    : `${r.inputs.sector || 'sector'} payers`;

  let out = l.desc || '';
  if (l.rank && isNum(l.median)) {
    out += ` At ${l.text} that is ${l.rank.text} of ${where}, where the median sits at ${fmt(l.median)}.`;
  } else if (isNum(l.median)) {
    out += ` The median across ${where} is ${fmt(l.median)}.`;
  }
  out += weightClause(l, f);
  if (l.note) out += ` ${l.note}`;
  return out.trim();
}

function divMetric(l, f, r) {
  const fmt = DIV_LINE_BY_ID[l.id]?.fmt || ((v) => dec(v, 2));

  /* The tick beside the name: which side of the payer median the figure falls
     on, already accounting for the lines where low is the good direction. A
     reading aid, never summed — the same rule the equity model states. */
  let vsMedian = 'na';
  if (isNum(l.value) && isNum(l.median)) {
    vsMedian = l.value === l.median ? 'pass'
      : ((l.better === 'low' ? l.value < l.median : l.value > l.median) ? 'pass' : 'fail');
  }

  const m = {
    id: l.id,
    label: l.label,
    fmt,
    better: l.better,
    value: l.value,
    median: l.median,
    sampleSize: l.sampleSize ?? null,
    // Only `ok` rows are read for the column headings, so a line with no
    // distribution keeps whatever source it had and never votes on the wording.
    source: l.source || 'sector',
    state: l.state === 'ok' ? 'ok' : 'na',
    grade: l.score,
    letter: l.letter,
    pctile: l.pctile,
    rank: l.rank,
    vsMedian,
    tickTitle: vsMedian === 'na'
      ? 'No payer median is available for this line'
      : `${vsMedian === 'pass' ? 'Better' : 'Worse'} than the median across ${r.inputs.sector || 'sector'} payers`,
    why: l.why || '',
    tag: tagFor(l),
  };
  m.explanation = explainFor(l, f, r, fmt);
  return m;
}

/**
 * One factor's lines, as subtopics.
 *
 * Grouped by the name each line carries, in first-appearance order — the
 * consistency factor interleaves its three groups, and re-sorting them would
 * put the lines in an order the specification does not use.
 */
function divGroups(f, r) {
  const seen = new Map();
  for (const line of f.lines) {
    const name = line.group || 'Other';
    if (!seen.has(name)) seen.set(name, []);
    seen.get(name).push(divMetric(line, f, r));
  }
  return [...seen.entries()].map(([name, metrics]) => ({
    name,
    desc: DIV_GROUP_NOTES[`${f.key}|${name}`] || null,
    metrics,
  }));
}

/* ==========================================================================
   The score header

   The same markup `factorPanel` writes in `gradeview.js`: the grade, the pill,
   the bar, and one line of basis under it. The basis line is the only thing
   that differs, because the arithmetic under it does — a weighted average over
   the lines that computed rather than a mean over all of them.
   ========================================================================== */

function basisLine(f, r) {
  const share = isNum(f.coverage) ? Math.round(f.coverage * 100) : null;
  let out = `Weighted across ${f.gradedLines} of ${f.totalLines} lines`;
  out += isNum(share) ? ` — ${share}% of the factor’s designed weight` : '';
  out += f.gradedLines < f.totalLines
    ? '. The rest was dropped and its weight shared across the lines that did compute; nothing is '
      + 'filled in with a zero or a median.'
    : '.';
  if (f.rank) {
    out += ` ${f.rank.text} of ${r.inputs.sector || 'sector'} payers`;
    out += f.reranked
      ? ', ranked against the sector’s own spread of composites.'
      : '. No spread of sector composites was available, so the weighted average is shown as it stands.';
  }
  return out;
}

export function divScorePanel(f, r) {
  const width = isNum(f.score) ? (f.score / DIV_MAX) * 100 : 0;

  return el('div', { class: 'scorepanel scorepanel--graded' }, [
    el('div', { class: 'scorepanel__head' }, [
      el('p', {}, [
        `${f.title} grade `,
        el('b', { text: isNum(f.score) ? `${dec(f.score, 2)} / ${DIV_MAX}` : 'not assessed' }),
      ]),
      gradePill(f.score, f.letter, { size: 'lg' }),
    ]),
    el('div', { class: 'gradebar' }, [
      el('div', {
        class: `gradebar__fill is-${toneForLetter(f.letter)}`,
        style: { width: `${width}%` },
      }),
    ]),
    el('p', { class: 't-tiny subtle mt1', text: basisLine(f, r) }),
  ]);
}

/**
 * The four grades as one list, exactly as `factorGradeList` draws the five.
 *
 * `highlight` picks one out, which is what the flake does on a factor tab and
 * for the same reason: the point is not the four grades again, it is where
 * the one being read sits against the other three without scrolling back.
 */
export function divGradeList(r, { hrefFor = null, highlight = null } = {}) {
  return el('div', { class: 'fgrades' }, r.order.map((key) => {
    const s = r.factors[key];
    const width = isNum(s.score) ? (s.score / DIV_MAX) * 100 : 0;
    const cls = `fgrades__row${key === highlight ? ' is-self' : ''}`;
    const row = [
      el('span', { class: 'fgrades__name', text: s.title }),
      el('span', { class: 'fgrades__track' }, [
        el('span', {
          class: `fgrades__fill is-${toneForLetter(s.letter)}`,
          style: { width: `${width}%` },
        }),
      ]),
      gradePill(s.score, s.letter),
    ];
    const href = hrefFor?.(s);
    return href
      ? el('a', { class: cls, href }, row)
      : el('div', { class: cls }, row);
  }));
}

/** The blocks behind one factor: a subtopic summary and a ratio table each. */
export function divFactorBlocks(a, r, f) {
  return divGroups(f, r).map((g) => blockEl(g.name, g.desc, [
    subtopicSummary(a, g.metrics),
    gradeTable(a, g.metrics),
  ]));
}

/**
 * Every line of one composite, as graded metrics in one flat list.
 *
 * What the Dividends tab needs and the ratio tables do not: the lines out of
 * their subtopics, so the strongest and the weakest across the whole factor
 * can be put beside each other.
 */
export function divLines(f, r) {
  return f.lines.map((line) => divMetric(line, f, r));
}

/**
 * The tick, counted — `countChecks` in `gradeview.js`, over dividend lines.
 *
 * `vsMedian` is a display marker and nothing else. It is never summed into a
 * grade, and the number above it on the card is the weighted mean of the line
 * percentiles rather than of these. Two readings of the same lines, which is
 * why they sit under separate headings.
 */
export function divCheckCounts(metrics) {
  const out = { pass: 0, fail: 0, na: 0 };
  for (const m of metrics) out[m.vsMedian === 'pass' ? 'pass' : m.vsMedian === 'fail' ? 'fail' : 'na']++;
  return out;
}

/**
 * The lines carrying the grade and the lines holding it back.
 *
 * Split at the composite's own score rather than into halves, so both
 * headings are true by construction — the rule `renderFactorTab` uses, and
 * the reason a composite whose lines all point one way shows one column
 * rather than an invented worst that is in fact carrying the grade too.
 */
export function divLeaders(metrics, score) {
  const ranked = metrics
    .filter((m) => isNum(m.grade) && isNum(m.pctile))
    .sort((x, y) => y.grade - x.grade);
  return {
    above: ranked.filter((m) => m.grade >= score).slice(0, 5),
    below: ranked.filter((m) => m.grade < score).sort((x, y) => x.grade - y.grade).slice(0, 5),
  };
}

/* ==========================================================================
   The things the module owes a reader

   Shared between both surfaces so the wording cannot drift apart: the Analysis
   page prints them as a block, the Dividends tab folds them into a disclosure.
   ========================================================================== */

export function lapsedNotice(r) {
  const last = r.inputs.lastPaymentAt
    ? new Date(r.inputs.lastPaymentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'some time ago';
  return notice(`<b>This dividend is lapsing.</b> The last regular payment was ${last}, more than two `
    + 'expected intervals ago. The forward lines report nothing rather than annualising a payment that has '
    + 'stopped being declared, and the trailing lines are falling toward zero on their own.', 'notice--warn');
}

export function reitNotice() {
  return notice('<b>Read the safety grade with care for a REIT.</b> A property trust pays out of funds '
    + 'from operations, and depreciation drives its net income far below the cash it collects — so a '
    + 'payout ratio measured on earnings reads well above 100% for a perfectly sound trust. The ranking is '
    + 'against other property payers, which absorbs some of this, but the specification is explicit that '
    + 'these formulas misread for the sector until funds from operations replaces the denominator.', 'notice--warn');
}

/** The seed-table warning, worded as `renderRatings` words the equity one. */
export function seedNotice(r) {
  if (r.table.quality !== 'seed') return null;
  return notice('The payer distributions shipped with this repo are <b>modelled, not measured</b> — '
    + 'shaped from sector norms so the module ranks sensibly before a real universe has been built over '
    + 'a live key. The ordering within a sector is meaningful; the exact percentile is not yet. Run '
    + '<code>python tools/make_dividend_seed.py</code> to replace them.');
}

/** Every disclosure the module owes, as sentences. `**bold**` is the only markup. */
export function disclosureParas(r) {
  const t = r.table;
  return [
    `Ranked against ${t.count ? `${t.count.toLocaleString('en-US')} ` : ''}dividend payers in `
      + `${t.sector || 'the sector'}. **Payers only**: a company that pays nothing is outside this `
      + 'universe rather than at the bottom of it, because a non-payer ranked against payers would come '
      + 'last on every line and read as a bad dividend rather than as no dividend.',

    'Each grade is the **weighted** average of its lines — the specification’s weights, printed under '
      + 'every row — re-ranked against the sector’s own spread of composites. A weighted average of '
      + 'percentiles bunches around the middle, and the re-rank is what puts the 1 to 5 scale back.',

    'Two figures are substitutes for feeds that do not exist. The **forward dividend** is the latest '
      + 'declared payment annualised at its own cadence — an indicated rate, not an analyst forecast. '
      + '**Forward cash flow** is the consensus earnings estimate scaled by the company’s own three-year '
      + 'cash conversion. Every line that uses either carries a chip beside its name.',

    'A payout ratio above 100% is kept exactly as it computes and ranks badly. It is never capped and '
      + 'never reported as not-meaningful, because a company paying out more than it earns is the single '
      + 'most useful thing this module can tell you.',

    'These grades are **entirely separate from the quant rating** on the Ratings tab: a different '
      + 'universe, a different scale and a different distribution table. Nothing here feeds the five '
      + 'factor grades and nothing there feeds these, which is why the dividend has no spoke on the flake.',
  ];
}

/** One paragraph per disclosure, with the bold this module writes itself. */
export function disclosureBody(r) {
  return el('div', { class: 'dvg-disc__body' }, disclosureParas(r).map((text) => el('p', {
    html: text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>'),
  })));
}

/** Why the four do not add up to one number. Printed, not left to be noticed. */
export function noTotalLine(r) {
  return el('p', { class: 'sec__summary' }, [
    'Four composites on a 1 to 5 scale, each ranked against the dividend payers in ',
    el('b', { text: r.inputs.sector || 'this sector' }),
    '. There is deliberately no overall dividend grade: safety, growth and yield pull against each '
    + 'other by construction, so an average of the four would hide the very tension worth reading.',
  ]);
}

/** The one-line answer for a company outside the universe. */
export function notAPayer(a, r) {
  return el('p', { class: 'sec__summary' }, [
    el('b', { text: `${a.facts?.name || 'This company'} is not in the dividend universe.` }),
    el('span', { text: ` ${r.why}` }),
  ]);
}

/* ==========================================================================
   The Analysis page

   One overview section and one section per composite — the same shape the
   report already uses for the factor grades and the five factors that follow
   them, minus the flake.
   ========================================================================== */

/** Resolves once the Analysis sections have their contents. See `keepAnchored`. */
let filled = Promise.resolve();

/**
 * Hold a jump that the sections are about to grow out from under.
 *
 * The four fill at the same moment, and the ones above the target grow by
 * thousands of pixels as they do — so a jump that landed correctly on an
 * empty section is several screens wrong a beat later. The jump is repeated
 * once they have all filled, and only then: a reader who has scrolled in the
 * meantime has answered the question the anchor was asking, and yanking the
 * page out from under them would be worse than landing in the wrong place.
 */
function keepAnchored(anchor, pending) {
  if (!anchor) return;

  /* The guard watches for the reader's own input rather than for a change in
     `scrollY`. The page's scroll position moves on its own while the sections
     fill — the browser adjusts it to keep the view stable as content above
     grows — so "has `scrollY` changed" answers yes every time and the jump
     never happens. A wheel, a touch or a key is the reader; nothing else is. */
  let moved = false;
  const stop = () => { moved = true; };
  const events = ['wheel', 'touchstart', 'keydown', 'mousedown'];
  const opts = { passive: true };
  for (const name of events) window.addEventListener(name, stop, opts);

  Promise.resolve(pending).then(() => {
    for (const name of events) window.removeEventListener(name, stop, opts);
    if (moved) return;
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
}

/**
 * Open one composite on the Analysis tab, from a surface that is not it.
 *
 * `filled` is read after `openAnalysis` on purpose: if the Analysis panel has
 * not been built yet, that call is what builds it, and it is the promise from
 * *that* build this has to wait on.
 */
export function openDividendSection(nav, anchor) {
  nav.openAnalysis?.(anchor);
  keepAnchored(anchor, filled);
}

export function renderDividendGrades(a) {
  /* The sections are built empty and filled when the payer table lands.
     Building them empty matters: every other anchor on the Analysis tab exists
     the moment the tab does, and the boot-time hash jump — and the Dividends
     tab's way back into the report — both resolve an id synchronously. A
     section that only appeared a fetch later would swallow every link to it.
     Growing downward afterwards leaves the reader where the jump put them. */
  const shells = new Map([['dividend-grades', null],
    ...DIV_FACTORS.map((f) => [f.anchor, f])]);

  const nodes = [...shells].map(([id, f]) => card(id, [
    el('div', { class: 'card__head' }, [
      el('h2', { text: f ? `${a.facts.name} ${f.title}` : `${a.facts.name} Dividend Grades` }),
      el('p', { text: f ? f.question : 'Four composites from the dividend module, each the weighted '
        + 'average of its own lines and each ranked against the dividend payers in this sector rather '
        + 'than against the whole of it.' }),
    ]),
    el('p', { class: 'sec__summary', text: 'Ranking against sector payers…' }),
  ]));

  const host = el('div', { class: 'dvg' }, nodes);
  const at = (id) => host.querySelector(`#${id}`);

  filled = loadDividendScores(a)
    .then((r) => {
      at('dividend-grades').replaceChildren(...overviewSection(a, r));
      for (const f of DIV_FACTORS) {
        const node = at(f.anchor);
        // A non-payer has no composites at all — the overview says so in one
        // line, and four empty sections under it would say it four more times.
        if (!r.pays) node.remove();
        else node.replaceChildren(...factorSection(a, r, r.factors[f.key]));
      }
    })
    .catch((error) => {
      at('dividend-grades').replaceChildren(
        el('div', { class: 'card__head' }, [el('h2', { text: `${a.facts.name} Dividend Grades` })]),
        notice(`The dividend grades could not be built — ${String(error?.message || error)}.`, 'notice--error'));
      for (const f of DIV_FACTORS) at(f.anchor)?.remove();
    });

  /* The boot-time hash jump into one of these sections, held the same way.
     Registered now rather than on the next frame: `keepAnchored` watches for
     the reader's input and reads nothing about the page, so it has no reason
     to wait for the jump it is guarding — and a `requestAnimationFrame` here
     would never fire at all while the tab is in the background, which is
     exactly the trap `selectTab` documents. */
  const wanted = location.hash.slice(1);
  if (shells.has(wanted)) keepAnchored(wanted, filled);

  return host;
}

/** The overview: the four grades, why there is no fifth number, and the basis. */
function overviewSection(a, r) {
  return [
    el('div', { class: 'card__head' }, [
      el('h2', { text: `${a.facts.name} Dividend Grades` }),
      el('p', { text: 'Four composites from the dividend module, each the weighted average of its own '
        + 'lines and each ranked against the dividend payers in this sector rather than against the '
        + 'whole of it.' }),
    ]),
    r.pays ? noTotalLine(r) : notAPayer(a, r),

    r.pays ? seedNotice(r) : null,
    r.pays && r.lapsed ? lapsedNotice(r) : null,
    r.pays && r.inputs.sector === 'Real Estate' ? reitNotice() : null,

    r.pays ? blockEl('Dividend Grades',
      `Each grade is the weighted average of its lines, on a scale of 1 to ${DIV_MAX}.`,
      [divGradeList(r, { hrefFor: (s) => `#${s.anchor}` })]) : null,

    r.pays ? blockEl('Where these grades come from',
      'The universe, the arithmetic and the two figures that stand in for feeds this data source does '
      + 'not carry.', [disclosureBody(r)]) : null,
  ].filter(Boolean);
}

/**
 * One composite, as a section of the report.
 *
 * `renderFactor` with the flake taken out — and nothing else taken out. The
 * intro keeps the full width it leaves behind rather than holding a gap where
 * a wedge the dividend is not part of would have gone.
 */
function factorSection(a, r, f) {
  return [
    el('div', { class: 'sec__intro' }, [
      el('h2', { text: `${a.facts.name} ${f.title}` }),
      el('p', { text: f.question }),
      el('p', { class: 'sec__summary', text: f.blurb }),
      divScorePanel(f, r),
    ]),
    ...divFactorBlocks(a, r, f),
  ];
}
