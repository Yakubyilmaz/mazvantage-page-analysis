/* ==========================================================================
   Vanlior — the dividend scores panel

   The third panel of the Dividends tab: the four composites from
   `dividend-score.js`, the lines behind each one, and the disclosures the
   module owes a reader.

   ---------------------------------------------------------------------------
   Four cards, and deliberately no fifth
   ---------------------------------------------------------------------------

   Every instinct of a scoring page is to add a headline number across the
   top. This one does not, and the panel says why in one line rather than
   leaving a reader to wonder whether it is missing: safety, growth, yield and
   consistency pull against each other, and the tension between them is the
   finding. A company with an A on safety and an F on yield is telling you
   something precise; the average of those two is telling you nothing.

   ---------------------------------------------------------------------------
   What the panel has to disclose, and does
   ---------------------------------------------------------------------------

   - the ranks are against **payers in the same sector**, not all companies
   - the table behind them is **modelled** until somebody runs a measured build
   - two figures are **workarounds** for feeds that do not exist, and say so
   - lines that could not be built are **listed with their reasons**, not hidden
   - REITs are **called out**: the spec is explicit that payout ratios on net
     income misread for them, and a panel that scored one silently would be
     the single worst thing this module could do
   ========================================================================== */

import { el, isNum, pct } from './util.js';
import { card, ohead, notice } from './ui.js';
import { DIV_FACTOR_BY_KEY } from './dividend-lines.js';
import { loadDividendStats, scoreDividends, dividendTone } from './dividend-score.js';
import { loadDividendFeeds } from './dividend-model.js';

/** Which factors the reader has opened. Module-level, so a redraw keeps them. */
const open = new Set();

/**
 * The panel. Returns the cards synchronously and fills them once the payer
 * table lands — the rest of the tab is already on screen by then, and a
 * skeleton for four cards is less use than the cards arriving.
 */
export function dividendScoresPanel(a, nav = {}) {
  const host = el('div', { class: 'dvs' }, [el('p', { class: 'dvs-loading', text: 'Ranking against sector payers…' })]);

  /* The payer table and the two quarterly statements, together: the table is
     one shared fetch per page load, the statements are two requests and only a
     reader who opened this panel pays for them. */
  Promise.all([
    loadDividendStats(),
    loadDividendFeeds(a.facts?.symbol || a.ds?.symbol, a.ds),
  ]).then(([stats, feeds]) => {
    const result = scoreDividends(a, stats, { feeds });
    host.replaceChildren(...body(result, a));
  }).catch((error) => {
    host.replaceChildren(notice(`The dividend scores could not be built — ${String(error?.message || error)}.`, 'notice--error'));
  });

  return [card('dv-scores', [
    ohead('Dividend scores', null,
      'Four composite scores from the dividend module: safety, growth, yield and consistency, '
      + 'each ranked against the dividend payers in this company’s own sector.'),
    host,
  ], 'ocard ovw__c12')];
}

/* ==========================================================================
   The body
   ========================================================================== */

function body(r, a) {
  if (!r.pays) {
    return [
      el('p', { class: 'dvs-none' }, [
        el('strong', { text: `${a.facts?.name || 'This company'} is not in the dividend universe.` }),
        el('span', { text: ` ${r.why}` }),
      ]),
    ];
  }

  return [
    lede(r),
    r.lapsed ? lapsedNotice(r) : null,
    r.inputs.sector === 'Real Estate' ? reitNotice() : null,
    el('div', { class: 'dvs-grid' }, r.order.map((k) => factorCard(r.factors[k], r))),
    el('div', { class: 'dvs-detail' }, r.order.map((k) => factorDetail(r.factors[k]))),
    disclosure(r),
  ].filter(Boolean);
}

/** The one line that explains the absence of a headline number. */
function lede(r) {
  return el('p', { class: 'dvs-lede' }, [
    'Four composites on a 1–5 scale, each ranked against the dividend payers in ',
    el('b', { text: r.inputs.sector || 'this sector' }),
    '. There is deliberately no overall dividend score: safety, growth and yield pull against '
    + 'each other, so an average of the four would hide the very tension worth reading. These '
    + 'are also entirely separate from the quant rating on the Ratings tab — a different '
    + 'universe, a different scale and a different table.',
  ]);
}

function lapsedNotice(r) {
  const last = r.inputs.lastPaymentAt
    ? new Date(r.inputs.lastPaymentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'some time ago';
  return notice(`<b>This dividend is lapsing.</b> The last regular payment was ${last}, more than two `
    + 'expected intervals ago. The forward lines report nothing rather than annualising a payment that has '
    + 'stopped being declared, and the trailing lines are falling toward zero on their own.', 'notice--warn');
}

function reitNotice() {
  return notice('<b>Read the safety factor with care for a REIT.</b> A property trust pays out of funds '
    + 'from operations, and depreciation drives its net income far below the cash it collects — so a '
    + 'payout ratio measured on earnings reads well above 100% for a perfectly sound trust. The ranking is '
    + 'against other property payers, which absorbs some of this, but the specification is explicit that '
    + 'these formulas misread for the sector until funds from operations replaces the denominator.', 'notice--warn');
}

/* ==========================================================================
   One factor, as a card
   ========================================================================== */

function factorCard(f, r) {
  const isOpen = open.has(f.key);
  const toggle = el('button', {
    type: 'button', class: 'dvs-more', 'aria-expanded': String(isOpen),
    'aria-controls': `dvs-lines-${f.key}`,
    text: isOpen ? 'Hide the lines' : `${f.gradedLines} lines`,
    onclick: () => {
      if (open.has(f.key)) open.delete(f.key); else open.add(f.key);
      const panel = document.getElementById(`dvs-lines-${f.key}`);
      const nowOpen = open.has(f.key);
      if (panel) panel.hidden = !nowOpen;
      toggle.setAttribute('aria-expanded', String(nowOpen));
      toggle.textContent = nowOpen ? 'Hide the lines' : `${f.gradedLines} lines`;
      if (nowOpen) panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
  });

  return el('article', { class: `dvs-card is-${dividendTone(f.score)}` }, [
    el('h3', { class: 'dvs-card__t', text: f.title }),
    el('p', { class: 'dvs-card__q', text: f.question }),
    el('div', { class: 'dvs-card__score' }, [
      el('b', { text: isNum(f.score) ? f.score.toFixed(2) : 'n/a' }),
      el('span', { class: 'dvs-card__letter', text: f.letter || '' }),
    ]),
    el('p', { class: 'dvs-card__rank', text: f.rank ? `${f.rank.text} of ${r.inputs.sector || 'sector'} payers` : 'Not ranked' }),
    coverageBar(f),
    toggle,
  ]);
}

/**
 * How much of the factor was actually measurable.
 *
 * The honest alternative to a confidence adjective: the share of the factor's
 * designed weight that produced a figure. 100% means every line computed.
 */
function coverageBar(f) {
  const share = isNum(f.coverage) ? Math.round(f.coverage * 100) : 0;
  return el('div', { class: 'dvs-cov', title: `${f.usedWeight} of ${f.designedWeight} weight computed` }, [
    el('div', { class: 'dvs-cov__track' }, [el('i', { style: { width: `${share}%` } })]),
    el('span', { text: `${share}% of the factor measured` }),
  ]);
}

/* ==========================================================================
   The lines behind one factor
   ========================================================================== */

function factorDetail(f) {
  const groups = new Map();
  for (const line of f.lines) {
    const key = line.group || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }

  return el('div', {
    class: 'dvs-lines', id: `dvs-lines-${f.key}`, hidden: !open.has(f.key),
  }, [
    el('h3', { class: 'dvs-lines__t', text: `${f.title} — every line` }),
    el('p', { class: 'dvs-lines__b', text: f.blurb }),
    ...[...groups.entries()].map(([name, lines]) => el('div', { class: 'dvs-group' }, [
      el('h4', { text: name }),
      el('div', { class: 'dvs-rows' }, lines.map(lineRow)),
    ])),
    f.nm.length ? el('div', { class: 'dvs-nm' }, [
      el('h4', { text: `Not meaningful here — ${f.nm.length} of ${f.totalLines} lines` }),
      el('ul', {}, f.nm.map((l) => el('li', {}, [
        el('b', { text: l.label }),
        el('span', { text: ` — ${l.why}` }),
      ]))),
      el('p', { class: 'dvs-nm__note', text: 'Each of these is dropped and its weight shared across the '
        + 'lines that did compute. Nothing is filled in with a zero or a sector median.' }),
    ]) : null,
  ].filter(Boolean));
}

function lineRow(l) {
  const ok = l.state === 'ok';
  const tag = l.workaround
    ? el('i', { class: 'dvs-tag', title: l.workaround === 'A'
        ? 'Uses the indicated forward rate: the latest declared payment annualised at its own cadence, not an analyst forecast.'
        : 'Uses a modelled forward cash flow: the consensus earnings estimate scaled by the company’s own three-year cash conversion.',
      text: `Workaround ${l.workaround}` })
    : (l.approximate ? el('i', { class: 'dvs-tag', title: l.note || 'An approximation — see the note.', text: 'Approximate' }) : null);

  return el('div', { class: `dvs-row${ok ? '' : ' is-off'}` }, [
    el('span', { class: 'dvs-row__w', text: `${l.weight}%` }),
    el('span', { class: 'dvs-row__l' }, [
      el('b', { text: l.label }),
      tag,
      l.desc ? el('small', { text: l.desc }) : null,
      l.note ? el('small', { class: 'dvs-row__note', text: l.note }) : null,
      !ok && l.why ? el('small', { class: 'dvs-row__note', text: l.why }) : null,
    ].filter(Boolean)),
    el('span', { class: 'dvs-row__v', text: l.text }),
    ok
      ? el('span', { class: `dvs-row__g is-${dividendTone(l.score)}`, title: l.rank ? `${l.rank.text} of sector payers` : '' }, [
        el('b', { text: l.score.toFixed(2) }),
        el('span', { text: l.letter }),
      ])
      : el('span', { class: 'dvs-row__g is-na', text: l.state === 'nm' ? 'NM' : l.state === 'unranked' ? 'Unranked' : 'No data' }),
  ]);
}

/* ==========================================================================
   What the reader is owed
   ========================================================================== */

function disclosure(r) {
  const t = r.table;
  const seeded = t.quality === 'seed';
  const lines = [];

  lines.push(`Ranked against ${t.count ? `${t.count.toLocaleString('en-US')} modelled ` : ''}dividend payers `
    + `in ${t.sector || 'the sector'}. Payers only: a company that pays nothing is outside this universe `
    + 'rather than at the bottom of it, because a non-payer ranked against payers would come last on every '
    + 'line and read as a bad dividend rather than as no dividend.');

  if (seeded) {
    lines.push('The distributions behind these ranks are **modelled, not measured** — shaped from sector '
      + 'norms so the module ranks sensibly before a real universe has been built over a live key. The '
      + 'ordering within a sector is meaningful; the exact percentile is not yet. Regenerate or replace the '
      + 'table with `tools/make_dividend_seed.py`.');
  }

  lines.push('Two figures are substitutes for feeds that do not exist. The **forward dividend** is the '
    + 'latest declared payment annualised at its own cadence — an indicated rate, not an analyst forecast. '
    + '**Forward cash flow** is the consensus earnings estimate scaled by the company’s own three-year '
    + 'cash conversion. Every line that uses either is tagged.');

  lines.push('A payout ratio above 100% is kept exactly as it computes and ranks badly. It is never capped '
    + 'and never reported as not-meaningful, because a company paying out more than it earns is the single '
    + 'most useful thing this module can tell you.');

  return el('details', { class: 'dvs-disc' }, [
    el('summary', { text: 'Where these scores come from' }),
    el('div', {}, lines.map((text) => el('p', {
      // The only markup is the bold this file writes itself.
      html: text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>'),
    }))),
  ]);
}
