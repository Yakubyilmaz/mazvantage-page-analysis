/* ==========================================================================
   Vanlior — Alpha Signal components

   The pieces both surfaces are built from: the score block, the category
   card, the evidence drawer, and the four badges that keep a fact, a
   calculation, an interpretation and an attention measure visually distinct.

   Kept apart from both views because the tab and the desk render the same
   things at different densities, and a category card that disagreed with
   itself between the two would undo the one thing this feature is for.

   ---------------------------------------------------------------------------
   The badge is the load-bearing piece of design here
   ---------------------------------------------------------------------------

   Every number on these surfaces carries one of five words: VERIFIED FACT,
   CALCULATED SIGNAL, MODEL INTERPRETATION, ATTENTION DATA, INSUFFICIENT DATA.
   They are not decoration and they are not a legend nobody reads — they are
   the reason a reader can look at "revenue growth accelerated 6 points" and
   "followed by fewer analysts than its size suggests" and know, without
   clicking anything, that the first is arithmetic on a filing and the second
   is this engine's opinion about a market-structure heuristic.

   Colour is not used to carry this distinction, only weight and the word
   itself. Green and red are reserved for direction — up and down — because
   that is what they mean everywhere else in this product, and a badge that
   competed for the same channel would make both unreadable.
   ========================================================================== */

import { el, isNum, dec, fmtDate } from './util.js';
import { createDialog, arrow } from './markethub-ui.js';
import { CATEGORY_BY_ID } from './alpha-signals.js';

/* ==========================================================================
   Small parts
   ========================================================================== */

/** The provenance badge. One per signal, always. */
export function qualityBadge(sig) {
  const tone = sig.dataQuality === 'unavailable' ? 'gap'
    : sig.dataQuality === 'attention' ? 'attn'
      : sig.dataQuality === 'estimated' ? 'model' : 'fact';
  return el('span', {
    class: `as-badge as-badge--${tone}`,
    text: sig.qualityLabel,
    title: BADGE_HELP[sig.dataQuality] || '',
  });
}

const BADGE_HELP = {
  verified: 'A figure as filed or published. Reproduced here, not adjusted.',
  calculated: 'Arithmetic this app did on filed figures. The calculation is stated in full.',
  estimated: 'A figure somebody else modelled — a consensus, a rating, a target.',
  attention: 'A measure of how closely the company is followed. Not evidence about the business.',
  unavailable: 'No data behind this. The provider that would supply it is named.',
};

export const confidencePill = (level) => el('span', {
  class: `as-conf as-conf--${level}`,
  text: `${level} confidence`,
});

/** A direction dot. Green up, red down, hollow for neutral, dashed for a gap. */
export const statusDot = (status) => el('span', {
  class: `as-dot as-dot--${status.replace('_', '-')}`,
  'aria-hidden': 'true',
});

export const STATUS_WORD = {
  positive: 'Positive',
  negative: 'Negative',
  neutral: 'Neutral',
  insufficient_data: 'No data',
};

/**
 * A source, printed the same way everywhere it appears.
 *
 * The link is rendered only when a feed actually supplied one. Constructing a
 * plausible EDGAR URL from a CIK and a date would be right most of the time,
 * and a citation that is right most of the time is not a citation.
 */
export function sourceLine(src, { compact = false } = {}) {
  if (!src) return el('p', { class: 'as-src as-src--none', text: 'No source attached.' });
  const bits = [
    el('span', { class: `as-tier as-tier--${src.reliabilityTier}`, text: src.typeLabel }),
    el('span', { class: 'as-src__pub', text: src.publisher }),
  ];
  if (!compact && src.publicationDate) {
    bits.push(el('span', { class: 'as-src__date', text: `Published ${src.publicationDate}` }));
  }
  if (src.url) {
    bits.push(el('a', {
      class: 'as-src__link', href: src.url, target: '_blank', rel: 'noopener noreferrer',
      text: 'View original source →',
    }));
  }
  return el('p', { class: 'as-src' }, bits);
}

/* ==========================================================================
   The score block
   ========================================================================== */

/**
 * The headline: the number, its scale, and immediately what it is built on.
 *
 * Coverage and confidence sit *inside* this block rather than under it,
 * because a 78 that was computed from two categories and a 78 computed from
 * nine are different claims and the reader has to meet both facts at once.
 * Every surface that prints the score prints this block.
 */
export function scoreBlock(result, { quantScore = null, compact = false } = {}) {
  const score = result.score;
  const band = !isNum(score) ? 'na' : score >= 70 ? 'high' : score >= 55 ? 'mid' : score >= 40 ? 'low' : 'weak';

  return el('div', { class: `as-score ${compact ? 'as-score--compact' : ''}`.trim() }, [
    el('div', { class: `as-score__dial as-score__dial--${band}` }, [
      el('strong', { class: 'as-score__n', text: isNum(score) ? String(score) : '—' }),
      el('span', { class: 'as-score__d', text: '/100' }),
    ]),
    el('div', { class: 'as-score__meta' }, [
      el('p', { class: 'as-score__t', text: 'Alpha Signal' }),
      el('div', { class: 'as-score__bars' }, [
        meter('Data coverage', result.coveragePct, `${result.coveragePct}%`,
          'The share of the model\'s weight that could actually be measured. '
          + 'Categories with no data are dropped from the score, not scored zero.'),
        meter('Signals', Math.min(100, (result.counts.total / 20) * 100),
          `${result.counts.positive}+ · ${result.counts.negative}− · ${result.counts.missing} gaps`,
          'Positive, negative, and the ones no provider could fill.'),
      ]),
      el('div', { class: 'as-score__pills' }, [
        confidencePill(result.confidence),
        isNum(quantScore)
          ? el('span', { class: 'as-quant', title: 'The existing quant rating, on its own 0-5 scale. A different question, deliberately a different scale.' },
            [el('i', { text: 'Quant' }), el('b', { text: `${dec(quantScore, 2)}/5` })])
          : null,
        el('span', { class: 'as-ver', title: `Weighting version ${result.version}. Two scores from different versions are not comparable.`, text: `v${result.version}` }),
      ]),
    ]),
  ]);
}

function meter(label, pct, value, help) {
  return el('div', { class: 'as-meter', title: help }, [
    el('div', { class: 'as-meter__top' }, [
      el('span', { class: 'as-meter__k', text: label }),
      el('span', { class: 'as-meter__v', text: value }),
    ]),
    el('div', { class: 'as-meter__track' }, [
      el('div', { class: 'as-meter__fill', style: { width: `${Math.max(2, Math.min(100, pct || 0))}%` } }),
    ]),
  ]);
}

/* ==========================================================================
   The classification
   ========================================================================== */

export function archetypeBlock(classification, nav = {}) {
  const { primary, others, supporting, opposing } = classification;

  const list = (title, cats, tone) => (cats.length ? el('div', { class: `as-arch__col as-arch__col--${tone}` }, [
    el('h4', { text: title }),
    el('ul', {}, cats.slice(0, 4).map((c) => el('li', {}, [
      el('span', { class: 'as-arch__cat', text: c.title }),
      el('span', { class: 'as-arch__sc', text: String(Math.round(c.score)) }),
    ]))),
  ]) : null);

  return el('section', { class: 'as-arch' }, [
    el('div', { class: 'as-arch__head' }, [
      el('p', { class: 'as-arch__eyebrow', text: 'Primary classification' }),
      el('h3', { class: 'as-arch__t', text: primary.label }),
      el('p', { class: 'as-arch__b', text: primary.blurb }),
      others.length
        ? el('div', { class: 'as-arch__tags' }, [
          el('span', { class: 'as-arch__tagk', text: 'Also matches' }),
          ...others.map((o) => el('span', { class: 'as-arch__tag', text: o.label, title: o.blurb })),
        ])
        : null,
    ]),
    el('div', { class: 'as-arch__cols' }, [
      list('Supporting evidence', supporting, 'up'),
      list('Counter-evidence', opposing, 'down'),
    ].filter(Boolean)),
  ]);
}

/* ==========================================================================
   A category card
   ========================================================================== */

/**
 * One category, with its signals collapsed underneath it.
 *
 * The card shows what the category concluded; each signal row shows what it
 * concluded it *from*; the drawer behind a signal row shows the arithmetic.
 * Three levels, and a reader can stop at whichever one answers their
 * question — which is the only way to put sixty numbers on a page without
 * it becoming a wall.
 */
export function categoryCard(cat, { open = false } = {}) {
  const spec = CATEGORY_BY_ID[cat.id];
  const band = !isNum(cat.score) ? 'na'
    : cat.score >= 65 ? 'up' : cat.score <= 35 ? 'down' : 'flat';

  const rows = el('div', { class: 'as-cat__rows', hidden: !open });
  rows.append(...cat.signals.map(signalRow));

  const toggle = el('button', {
    type: 'button', class: 'as-cat__toggle', 'aria-expanded': String(open),
    onclick: () => {
      const now = rows.hidden;
      rows.hidden = !now;
      toggle.setAttribute('aria-expanded', String(now));
      toggle.replaceChildren(el('span', { text: now ? 'Hide signals' : `${cat.signals.length} signal${cat.signals.length === 1 ? '' : 's'}` }), arrow());
    },
  }, [el('span', { text: open ? 'Hide signals' : `${cat.signals.length} signal${cat.signals.length === 1 ? '' : 's'}` }), arrow()]);

  return el('article', { class: `as-cat as-cat--${band}`, 'data-category': cat.id }, [
    el('header', { class: 'as-cat__head' }, [
      el('div', { class: 'as-cat__id' }, [
        el('h3', { class: 'as-cat__t', text: cat.title }),
        el('p', { class: 'as-cat__q', text: spec?.question || '' }),
      ]),
      el('div', { class: 'as-cat__score' }, [
        el('strong', { text: isNum(cat.score) ? String(Math.round(cat.score)) : '—' }),
        el('small', { text: `${Math.round(cat.weight * 100)}% weight` }),
      ]),
    ]),
    el('div', { class: 'as-cat__meta' }, [
      cat.evidence === 'attention'
        ? el('span', { class: 'as-badge as-badge--attn', text: 'ATTENTION DATA', title: BADGE_HELP.attention })
        : null,
      cat.evidence === 'context'
        ? el('span', { class: 'as-badge as-badge--model', text: 'CONTEXT', title: 'A fact about the sector, not about this company.' })
        : null,
      confidencePill(cat.confidence),
      el('span', { class: 'as-cat__counts', text: `${cat.counts.positive}+ · ${cat.counts.negative}− · ${cat.counts.missing} gaps` }),
      cat.asOf ? el('span', { class: 'as-cat__as', text: `to ${cat.asOf}` }) : null,
    ].filter(Boolean)),
    toggle,
    rows,
  ]);
}

/** One signal, as a row that opens its own evidence. */
export function signalRow(sig) {
  const gap = sig.status === 'insufficient_data';
  return el('button', {
    type: 'button',
    class: `as-sig ${gap ? 'is-gap' : ''}`.trim(),
    onclick: () => openEvidence(sig),
    title: gap ? 'No data — open to see what would be needed' : 'Open the evidence behind this signal',
  }, [
    statusDot(sig.status),
    el('span', { class: 'as-sig__body' }, [
      el('span', { class: 'as-sig__n', text: sig.name }),
      el('span', { class: 'as-sig__i', text: gap
        ? `Needs ${sig.unavailable?.provider || 'a provider'}`
        : (sig.interpretation || '') }),
    ]),
    el('span', { class: 'as-sig__right' }, [
      qualityBadge(sig),
      isNum(sig.score) ? el('span', { class: 'as-sig__s', text: String(Math.round(sig.score)) }) : null,
    ].filter(Boolean)),
  ]);
}

/* ==========================================================================
   The evidence drawer
   ========================================================================== */

/**
 * Everything behind one signal, in the order a sceptic reads it.
 *
 * Fact before calculation before interpretation, and the limitations last but
 * never optional — a signal whose provider wrote no limitation gets a stated
 * default rather than a silent absence, because "there is nothing to qualify
 * here" is itself a claim and somebody should have to make it on purpose.
 */
export function openEvidence(sig) {
  return createDialog(sig.name, () => {
    const gap = sig.status === 'insufficient_data';

    if (gap) {
      return el('div', { class: 'as-ev' }, [
        el('div', { class: 'as-ev__row' }, [qualityBadge(sig)]),
        section('What this would measure', el('p', { text: CATEGORY_BY_ID[sig.category]?.question || '' })),
        section('Why it is missing', el('p', { text: sig.unavailable?.note
          || 'No provider behind this measurement is connected.' })),
        section('What would fill it', el('p', { class: 'as-ev__prov', text: sig.unavailable?.provider || 'An unnamed provider.' })),
        el('p', { class: 'as-ev__foot', text: 'Nothing is substituted for this measurement. It '
          + 'lowers the data coverage of the score rather than being approximated from something else.' }),
      ]);
    }

    return el('div', { class: 'as-ev' }, [
      el('div', { class: 'as-ev__row' }, [
        qualityBadge(sig),
        confidencePill(sig.confidence),
        el('span', { class: `as-stat as-stat--${sig.status}`, text: STATUS_WORD[sig.status] }),
      ]),

      section('The figures', el('div', { class: 'as-ev__nums' }, [
        numCell('Current', sig.raw, sig.unit),
        numCell('Prior', sig.previous, sig.unit),
        numCell('Change', sig.change, sig.unit, true),
      ])),

      section('Platform calculation', el('p', { class: 'as-ev__calc', text: sig.calculation })),

      sig.historical
        ? section('Historical comparison', el('p', { class: 'as-ev__hist', text: sig.historical }))
        : null,

      section('Model interpretation', el('p', { class: 'as-ev__interp' }, [
        el('span', { class: 'as-badge as-badge--model', text: 'MODEL INTERPRETATION' }),
        el('span', { text: ` ${sig.interpretation || 'No interpretation was recorded.'}` }),
      ])),

      section('Source', el('div', {}, [
        sourceLine(sig.source),
        el('p', { class: 'as-ev__fresh', text: sig.sourceDate
          ? `Source dated ${fmtDate(sig.sourceDate)} — ${sig.freshness.text}. Retrieved ${fmtDate(sig.retrievedAt)}.`
          : `Undated source. Retrieved ${fmtDate(sig.retrievedAt)}.` }),
      ])),

      section('Limitations', el('p', { class: 'as-ev__lim', text: sig.limitations
        || 'The provider recorded no specific limitation for this signal. That is not the same '
          + 'as there being none — read the calculation above and judge it yourself.' })),
    ].filter(Boolean));
  });
}

function section(title, body) {
  return el('section', { class: 'as-ev__sec' }, [el('h4', { text: title }), body]);
}

function numCell(label, value, unit, signed = false) {
  let text = '—';
  if (isNum(value)) {
    if (unit === 'margin' || unit === 'growth rate' || unit === 'return' || unit === 'share of revenue' || unit === 'spread') {
      text = `${signed && value > 0 ? '+' : ''}${dec(value * 100, 2)}%`;
    } else if (unit === 'currency') {
      text = Math.abs(value) >= 1e6
        ? `${value < 0 ? '−' : ''}${dec(Math.abs(value) / 1e9, 2)}bn`
        : dec(value, 2);
    } else if (Math.abs(value) >= 1000) {
      text = value.toLocaleString('en-US');
    } else {
      text = `${signed && value > 0 ? '+' : ''}${dec(value, 2)}`;
    }
  } else if (typeof value === 'string') {
    text = value;
  }
  return el('div', { class: 'as-ev__num' }, [
    el('span', { class: 'as-ev__numk', text: label }),
    el('strong', { class: `as-ev__numv ${signed && isNum(value) ? (value > 0 ? 'is-up' : value < 0 ? 'is-down' : '') : ''}`.trim(), text }),
    unit ? el('small', { text: unit }) : null,
  ]);
}

/* ==========================================================================
   Standing notices
   ========================================================================== */

/**
 * The paragraph that appears under every Alpha Signal surface.
 *
 * It is not a disclaimer bolted on at the end — it states the three things a
 * reader has to hold to read the number correctly, and they are things this
 * engine genuinely cannot do rather than things a lawyer wanted said.
 */
export function standingNotice() {
  return el('div', { class: 'as-note' }, [
    el('p', {}, [
      el('b', { text: 'What this score is. ' }),
      'A weighted reading of recent, dated evidence about a company — not a forecast, and not a '
      + 'rating of the company\'s quality. It is deliberately a different question from the '
      + 'quant rating, on a different scale, so the two cannot be averaged.',
    ]),
    el('p', {}, [
      el('b', { text: 'The weights are unvalidated. ' }),
      'They are a stated starting allocation with a reason behind each one. No backtest supports '
      + 'them, because this app stores no history to backtest against. Treat the category scores '
      + 'as more informative than the composite.',
    ]),
    el('p', {}, [
      el('b', { text: 'Missing data is shown, never filled. ' }),
      'Signals with no provider behind them are listed with the integration that would supply '
      + 'them, and they lower the coverage figure. Nothing here is approximated from social '
      + 'media, forums or rumour.',
    ]),
  ]);
}
