/* ==========================================================================
   Maz Vantage — the Alpha Signal tab

   `?symbol=NKE&tab=alpha-signal`. One company, full depth: every provider,
   every signal, and the evidence behind each.

   ---------------------------------------------------------------------------
   Why it fetches after it renders
   ---------------------------------------------------------------------------

   Every other tab on this report is handed a finished `analyse()` result and
   returns a node synchronously. This one cannot: five of its feeds are not in
   the dataset, deliberately — a company report is already 32 requests and no
   other tab reads quarterly statements, 13F aggregates or the grade history.

   So it renders its own skeleton, fetches, and fills. The tab strip in
   `app.js` builds a panel once and keeps it, so this happens on first visit
   and never again for that company; switching away and back is free.

   ---------------------------------------------------------------------------
   The order of the page is an argument
   ---------------------------------------------------------------------------

   Score, then what it is built on, then what it could not see, then the
   evidence, then the timeline, then what would settle it. A reader who stops
   after the first screen has the number *and* its coverage; a reader who
   stops after the second knows what is missing before they have read a single
   piece of supporting evidence. That ordering is on purpose — the gaps come
   before the findings, because a list of findings read first is very hard to
   un-believe afterwards.
   ========================================================================== */

import { el, isNum, fmtDate } from './util.js';
import { card, ohead, notice } from './ui.js';
import { hasApiKey } from './fmp.js';
import { arrow } from './markethub-ui.js';
import { loadAlphaBag, runProviders, bagCapturedAt } from './alpha-providers.js';
import { scoreAlpha, classify, pairNote } from './alpha-score.js';
import { narrate } from './alpha-narrative.js';
import {
  scoreBlock, archetypeBlock, categoryCard, sourceLine, standingNotice,
  qualityBadge, openEvidence, statusDot,
} from './alphaview.js';
import { CATEGORY_BY_ID } from './alpha-signals.js';

export function renderAlphaTab(a, nav = {}) {
  const symbol = a.facts?.symbol || a.ds?.symbol || '';
  const host = el('div', { class: 'as-tab' });

  host.append(skeleton(symbol));

  // The report's own benchmark series, so the price and macro providers get a
  // relative reading rather than an absolute one. `analyse` already paid for
  // these; refetching them here would be two requests for data in memory.
  const benchmarks = a.benchmarks || a.ds?.snapshotExtras?.benchmarks || null;

  loadAlphaBag(symbol, { ds: a.ds })
    .then((bag) => {
      const signals = runProviders(bag, {
        symbol,
        marketCap: a.facts?.marketCap ?? null,
        benchmarks,
        quantScore: a.scores?.overall?.score ?? null,
      });
      const result = scoreAlpha(signals);
      const quant = a.scores?.overall?.score ?? null;
      const classification = classify(result, quant);
      const story = narrate(result, classification, symbol);
      host.replaceChildren(page(a, {
        result, classification, story, quant, symbol, capturedAt: bagCapturedAt(bag),
      }, nav));
    })
    .catch((err) => {
      console.error('alpha tab', err);
      host.replaceChildren(card('alpha-error', [
        ohead('Alpha Signal'),
        notice(`The Alpha Signal could not be built for this company — ${err.message}. `
          + 'Every other tab on this report is unaffected.', 'notice--error'),
      ], 'ocard ovw__c12'));
    });

  return host;
}

/* ==========================================================================
   Loading
   ========================================================================== */

function skeleton(symbol) {
  return el('div', { class: 'ovw' }, [
    card('alpha-loading', [
      ohead('Alpha Signal'),
      el('p', { class: 't-sm soft', text: `Reading the evidence for ${symbol}…` }),
      el('p', { class: 't-xs softer mt1', text: 'Eleven signal providers over quarterly '
        + 'statements, the analyst grade history, price targets, 13F aggregates and insider '
        + 'filings. Five of these feeds are not part of a company report, so they are being '
        + 'fetched now.' }),
      el('div', { class: 'sk sk--block', style: { marginTop: '16px' } }),
      el('div', { class: 'sk sk--line' }),
      el('div', { class: 'sk sk--line', style: { width: '70%' } }),
    ], 'ocard ovw__c12'),
  ]);
}

/* ==========================================================================
   The page
   ========================================================================== */

function page(a, state, nav) {
  const { result, classification, story, quant } = state;

  /* Narrative items carry a signal *id*, never a copy of the signal, so the
     evidence drawer opened from a summary line and the one opened from a
     category card are guaranteed to be the same object. The lookup is built
     once per render and passed down rather than held in module scope — two
     reports open in two tabs would otherwise share one index and each
     overwrite the other's. */
  const index = new Map(result.categories.flatMap((c) => c.signals).map((s) => [s.id, s]));

  return el('div', { class: 'as-page' }, [
    headSection(a, state, nav),
    coverageSection(result, story),
    summarySection(story),
    categoriesSection(result),
    evidenceSection(story, index),
    timelineSection(result),
    confirmSection(story),
    sourcesSection(story, state.capturedAt),
  ]);
}

/* ---- 1. the head --------------------------------------------------------- */

function headSection(a, { result, classification, quant }, nav) {
  return el('section', { class: 'as-head' }, [
    el('div', { class: 'as-head__top' }, [
      scoreBlock(result, { quantScore: quant }),
      archetypeBlock(classification, nav),
    ]),
    el('p', { class: 'as-pair' }, [
      el('b', { text: 'Reading the two ratings together. ' }),
      pairNote(quant, result.score),
      isNum(quant)
        ? el('button', {
          type: 'button', class: 'as-link',
          onclick: () => nav.openAnalysis?.(),
        }, ['See the quant rating', arrow()])
        : null,
    ].filter(Boolean)),
  ]);
}

/* ---- 2. what it could not see, before the findings ----------------------- */

function coverageSection(result, story) {
  const gaps = story.unconfirmed;
  const dark = result.categories.filter((c) => !isNum(c.score));

  return el('section', { class: 'as-sec as-sec--gaps' }, [
    el('h2', { class: 'as-sec__t', text: 'What this score could not see' }),
    el('p', { class: 'as-sec__b', text: `Read before the findings, not after them. `
      + `${result.coveragePct}% of the model's weight was measurable for this company; the rest `
      + 'is listed here. A category with no data is dropped from the score rather than scored '
      + 'zero, so the number above describes what was measured and nothing else.' }),

    dark.length
      ? el('div', { class: 'as-dark' }, dark.map((c) => el('span', {
        class: 'as-dark__pill',
        title: CATEGORY_BY_ID[c.id]?.question || '',
        text: `${c.title} · ${Math.round(c.weight * 100)}% weight unmeasured`,
      })))
      : el('p', { class: 'as-sec__b', text: 'Every category returned at least one scoreable signal.' }),

    gaps.length
      ? el('ul', { class: 'as-gaps' }, gaps.map((g) => el('li', { class: 'as-gaps__i' }, [
        el('div', { class: 'as-gaps__h' }, [
          el('span', { class: 'as-gaps__n', text: g.name }),
          el('span', { class: 'as-gaps__c', text: g.categoryTitle }),
        ]),
        g.note ? el('p', { class: 'as-gaps__note', text: g.note }) : null,
        el('p', { class: 'as-gaps__prov' }, [
          el('i', { text: 'Would need: ' }), el('span', { text: g.provider }),
        ]),
      ].filter(Boolean))))
      : null,
  ].filter(Boolean));
}

/* ---- 3. the summary ------------------------------------------------------ */

function summarySection(story) {
  return el('section', { class: 'as-sec' }, [
    el('h2', { class: 'as-sec__t', text: 'Summary' }),
    el('p', { class: 'as-summary', text: story.summary }),
    el('p', { class: 'as-sec__fine', text: 'Assembled from the structured signals below — every '
      + 'figure in it is a field on one of them, and no sentence here was written about this '
      + 'company specifically. No language model is involved, which is why the prose is flat '
      + 'and why no value in it can be invented.' }),
  ]);
}

/* ---- 4. the categories --------------------------------------------------- */

function categoriesSection(result) {
  // Weight order, not score order: the page should read the same way for
  // every company, and sorting by score would put a different category first
  // each time and make the layout argue for whatever happens to be highest.
  const cats = result.categories.slice().sort((x, y) => y.weight - x.weight);

  return el('section', { class: 'as-sec' }, [
    el('h2', { class: 'as-sec__t', text: 'The eleven categories' }),
    el('p', { class: 'as-sec__b', text: 'In weight order, which is the same on every company. '
      + 'Open a category for its signals, and a signal for the arithmetic and the source behind '
      + 'it.' }),
    el('div', { class: 'as-cats' }, cats.map((c) => categoryCard(c))),
  ]);
}

/* ---- 5. the evidence, both ways ------------------------------------------ */

function evidenceSection(story, index) {
  const col = (title, items, tone, empty) => el('div', { class: `as-eco as-eco--${tone}` }, [
    el('h3', { class: 'as-eco__t', text: title }),
    items.length
      ? el('ul', { class: 'as-eco__l' }, items.slice(0, 8).map((i) => el('li', {}, [
        el('button', {
          type: 'button', class: 'as-eco__i',
          onclick: () => {
            const sig = index.get(i.signalId);
            if (sig) openEvidence(sig);
          },
        }, [
          el('span', { class: 'as-eco__n', text: i.text }),
          el('span', { class: 'as-eco__m' }, [
            el('span', { class: 'as-eco__cat', text: i.categoryTitle }),
            el('span', { class: `as-badge as-badge--${badgeTone(i.quality)}`, text: i.qualityLabel }),
            i.sourceDate ? el('span', { class: 'as-eco__d', text: i.freshness?.text || '' }) : null,
          ].filter(Boolean)),
        ]),
      ])))
      : el('p', { class: 'as-eco__empty', text: empty }),
  ]);

  return el('section', { class: 'as-sec' }, [
    el('h2', { class: 'as-sec__t', text: 'The evidence' }),
    el('p', { class: 'as-sec__b', text: 'Only source-backed items appear here, in both columns. '
      + 'There is no verdict under them: an early-stage reading that resolves to a word is a '
      + 'word doing work the evidence has not done.' }),
    el('div', { class: 'as-ecols' }, [
      col('Improving', story.improving, 'up', 'No positive signal cleared the threshold.'),
      col('Deteriorating', story.deteriorating, 'down', 'No negative signal cleared the threshold.'),
    ]),
    story.risks.length
      ? el('div', { class: 'as-risks' }, [
        el('h3', { text: 'Read these with care' }),
        el('ul', {}, story.risks.slice(0, 6).map((r) => el('li', { text: r.text }))),
      ])
      : null,
  ].filter(Boolean));
}

const badgeTone = (q) => (q === 'unavailable' ? 'gap' : q === 'attention' ? 'attn'
  : q === 'estimated' ? 'model' : 'fact');

/* ---- 6. the timeline ----------------------------------------------------- */

function timelineSection(result) {
  const dated = result.categories
    .flatMap((c) => c.signals)
    .filter((s) => s.sourceDate && !Number.isNaN(new Date(s.sourceDate).getTime()))
    .sort((x, y) => new Date(y.sourceDate) - new Date(x.sourceDate));

  if (!dated.length) {
    return el('section', { class: 'as-sec' }, [
      el('h2', { class: 'as-sec__t', text: 'Signal timeline' }),
      el('p', { class: 'as-sec__b', text: 'No dated evidence was available for this company.' }),
    ]);
  }

  return el('section', { class: 'as-sec' }, [
    el('h2', { class: 'as-sec__t', text: 'Signal timeline' }),
    el('p', { class: 'as-sec__b', text: 'Every dated signal, newest first, by the date of the '
      + 'filing or publication behind it rather than by when this page read it. A 13F sits at '
      + 'its filing deadline, not at the quarter end it describes.' }),
    el('ol', { class: 'as-time' }, dated.slice(0, 14).map((s) => el('li', { class: 'as-time__i' }, [
      el('span', { class: 'as-time__d', text: fmtDate(s.sourceDate) }),
      el('span', { class: 'as-time__dot' }, [statusDot(s.status)]),
      el('button', {
        type: 'button', class: 'as-time__b', onclick: () => openEvidence(s),
      }, [
        el('span', { class: 'as-time__n', text: s.name }),
        el('span', { class: 'as-time__t', text: s.interpretation || '' }),
        el('span', { class: 'as-time__m' }, [
          qualityBadge(s),
          el('span', { class: 'as-time__src', text: s.source?.publisher || '' }),
        ]),
      ]),
    ]))),
  ]);
}

/* ---- 7. what would settle it --------------------------------------------- */

function confirmSection(story) {
  if (!story.whatWouldConfirm.length) return null;
  return el('section', { class: 'as-sec as-sec--confirm' }, [
    el('h2', { class: 'as-sec__t', text: 'What would confirm this' }),
    el('p', { class: 'as-sec__b', text: 'The measurements that would settle each question this '
      + 'engine asked. This is the closest the page comes to a conclusion, and it is on purpose: '
      + 'an early reading is not an answer, it is a list of things about to become answerable.' }),
    el('div', { class: 'as-confirm' }, story.whatWouldConfirm.map((w) => el('div', { class: 'as-confirm__i' }, [
      el('h4', { text: w.categoryTitle }),
      el('p', { text: w.text }),
    ]))),
  ]);
}

/* ---- 8. sources ---------------------------------------------------------- */

function sourcesSection(story, capturedAt) {
  return el('section', { class: 'as-sec as-sec--sources' }, [
    el('h2', { class: 'as-sec__t', text: 'Sources' }),
    el('p', { class: 'as-sec__b', text: `${story.sources.length} distinct sources behind the `
      + 'signals above. A link appears only where a feed supplied one — this app will not '
      + 'construct a plausible filing URL, because a citation that is usually right is not a '
      + 'citation.' }),
    el('ul', { class: 'as-srcs' }, story.sources.map((s) => el('li', {}, [
      sourceLine(s),
      el('span', { class: 'as-srcs__n', text: `${s.uses} signal${s.uses === 1 ? '' : 's'}` }),
    ]))),
    standingNotice(),
    /* The capture notice. It used to say the snapshot was a thin reading;
       it is not any more — `assets/data/AAPL.json` now carries all five
       Alpha feeds — so the caveat that remains is the one that is still
       true: the figures are real but frozen, while anything measured
       against *today* (freshness, days until the next report) moves on
       without them. Saying "bundled snapshot" and leaving it there would
       under-claim the data and over-claim its currency at the same time. */
    hasApiKey() ? null : el('p', { class: 'as-sec__fine', text: capturedAt
      ? `No FMP key is configured, so this reading was built from the bundled capture of `
        + `${capturedAt}. Every figure in it is real filed or published data — the quarterly `
        + 'statements, the analyst grade history, the price-target summary and the 13F '
        + 'aggregate are all present, which is why coverage is high. What it is not is live: '
        + 'freshness and any days-until reading are measured against today, not against the '
        + 'capture date. Connect a key in Settings for a current read.'
      : 'No FMP key is configured, so this reading was built from the bundled snapshot. '
        + 'Connect a key in Settings for a live read.' }),
  ].filter(Boolean));
}
