/* ==========================================================================
   Vanlior — the Alpha Signal desk

   `?view=alpha`. The market-wide half of the feature: a capped scan over a
   screened universe, ranked by the Alpha Signal, with every row's coverage
   and confidence printed beside its score.

   Three tabs, in the shape the other three desks already use (`qd-` classes
   from `deskpages.css`):

     scan     the scanner and its table
     method   what the score is, category by category, with the weights
     limits   what this cannot do — the backtest, the history, the providers

   ---------------------------------------------------------------------------
   Why the scan is capped, and why it says so on every result
   ---------------------------------------------------------------------------

   A company's Alpha Signal costs seven requests. The screened US universe
   above the size floor is several thousand companies, so a full-market scan
   is tens of thousands of requests from a browser — not slow, *impossible*
   inside any plan's rate limit.

   So this does what `runIdea` in `ideas.js` already does, and for the same
   reason: screen server-side for what the screener can filter on, sort by
   market cap, test the top N, and **state the cap in the result**. The
   sentence "150 of 3,412 companies tested, largest first" is printed above
   every table on this page.

   That is a real limitation and it biases the result toward companies you
   have already heard of — which is close to the opposite of what a
   discovery tool is for. The page says that too, in as many words, rather
   than presenting the top of a capped list as the top of the market.

   ---------------------------------------------------------------------------
   The quant column is the existing quant rating, not a new one
   ---------------------------------------------------------------------------

   `scoreFromRatios` in `model.js` is what the Investment Ideas screens
   already call. This page calls the same function with the same sector
   lookup, so the number in the Quant column is the product's own rating and
   not a second implementation that could drift from it. It is the lite
   grader — fewer ratios than a company report grades — and the column header
   says so.
   ========================================================================== */

import { el, isNum, dec } from './util.js';
import { fetchScreener, fetchFor, mapLimited, hasApiKey } from './fmp.js';
import { dedupeStocks } from './markethub-data.js';
import { loadSectorStats, sectorLookup, MAX_SCORE } from './grading.js';
import { scoreFromRatios } from './model.js';
import { SECTORS } from './nav.js';
import { arrow, emptyState } from './markethub-ui.js';
import { SCAN_FEEDS, runProviders } from './alpha-providers.js';
import { scoreAlpha, classify, ALPHA_WEIGHTS, CALC_VERSION } from './alpha-score.js';
import { CATEGORIES } from './alpha-signals.js';
import { standingNotice, confidencePill } from './alphaview.js';

/* ==========================================================================
   Scan settings
   ========================================================================== */

/**
 * How many companies a scan tests, and the sizes it offers.
 *
 * 150 as the default rather than something larger: at seven requests each
 * that is about a thousand calls, which is a minute of wall clock and a
 * visible dent in a day's quota. The reader chooses to spend more.
 */
const CAPS = [60, 150, 300];
const DEFAULT_CAP = 150;

const SIZE_FLOORS = [
  { id: 'all', label: 'Any size', min: 0 },
  { id: 'micro', label: 'Above $300m', min: 300e6 },
  { id: 'small', label: 'Above $2bn', min: 2e9 },
  { id: 'mid', label: 'Above $10bn', min: 10e9 },
];

const TABS = [
  { id: 'scan', label: 'Scanner' },
  { id: 'method', label: 'Method' },
  { id: 'limits', label: 'Limits' },
];
const TAB_ALIAS = { screener: 'scan', methodology: 'method', backtest: 'limits' };

/* ==========================================================================
   The page
   ========================================================================== */

export function renderAlphaDesk(sub, nav = {}) {
  const asked = TAB_ALIAS[sub] || sub;
  let tab = TABS.some((t) => t.id === asked) ? asked : 'scan';

  const page = el('main', { class: 'mh-page qd-page as-desk', id: 'alpha-desk' });
  const navigation = el('nav', { class: 'mh-navigation', 'aria-label': 'Alpha Signal sections' });
  const body = el('div', { class: 'qd-body' });
  const views = {};
  let liveScan = null;

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'VANLIOR ALPHA SIGNAL' }),
      el('h1', { class: 'qd-title', text: 'Alpha Signal' }),
      el('p', { class: 'qd-strap', text: 'Companies where something measurable has recently '
        + 'changed, and where fewer people than usual are looking. Eleven categories of dated, '
        + 'sourced evidence, scored 0–100 with the share of it that could actually be measured '
        + 'printed beside every number.' }),
      el('div', { class: 'mh-hero__meta' }, [
        el('button', {
          type: 'button', class: `mh-connection ${hasApiKey() ? 'is-connected' : ''}`,
          text: hasApiKey() ? 'FMP connected' : 'Connect FMP',
          onclick: () => nav.openSettings?.(),
        }),
        el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
        el('span', { class: 'qd-meta', text: `${CATEGORIES.length} categories · weighting v${CALC_VERSION} · unvalidated` }),
      ]),
    ]),
    navigation, body,
  );

  navigation.replaceChildren(...TABS.map((t) => el('button', {
    type: 'button', 'data-tab': t.id, text: t.label,
    class: t.id === tab ? 'is-active' : '',
    onclick: () => setTab(t.id),
  })));

  function remember(changes) {
    try {
      const url = new URL(location.href);
      for (const [k, v] of Object.entries(changes)) {
        if (v == null || v === '') url.searchParams.delete(k);
        else url.searchParams.set(k, String(v));
      }
      history.replaceState(history.state, '', url);
    } catch { /* history unavailable */ }
  }

  function setTab(id) {
    tab = TABS.some((t) => t.id === id) ? id : 'scan';
    remember({ sub: tab });
    for (const b of navigation.querySelectorAll('[data-tab]')) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    if (!views[tab]) {
      views[tab] = tab === 'scan' ? (liveScan = scanTab(nav, remember))
        : tab === 'method' ? methodTab(nav) : limitsTab(nav);
    }
    body.replaceChildren(views[tab]);
    page.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  views[tab] = tab === 'scan' ? (liveScan = scanTab(nav, remember))
    : tab === 'method' ? methodTab(nav) : limitsTab(nav);
  body.replaceChildren(views[tab]);
  navigation.querySelector(`[data-tab="${tab}"]`)?.setAttribute('aria-current', 'page');

  page.dispose = () => liveScan?.dispose?.();
  return page;
}

/* ==========================================================================
   The scanner
   ========================================================================== */

function scanTab(nav, remember) {
  const params = new URLSearchParams(location.search);
  const host = el('div', { class: 'as-scan' });

  const state = {
    sector: SECTORS.includes(params.get('industry')) ? params.get('industry') : '',
    size: SIZE_FLOORS.some((s) => s.id === params.get('screen')) ? params.get('screen') : 'small',
    cap: CAPS.includes(Number(params.get('days'))) ? Number(params.get('days')) : DEFAULT_CAP,
    search: '',
    sort: 'alpha',
  };
  let rows = [];
  let run = null;          // the in-flight scan, for cancellation
  let generation = 0;

  /* ---- controls ---- */
  const sectorSel = select('Sector', [{ value: '', label: 'All sectors' },
    ...SECTORS.map((s) => ({ value: s, label: s }))], state.sector, (v) => { state.sector = v; remember({ industry: v }); });
  const sizeSel = select('Minimum size', SIZE_FLOORS.map((s) => ({ value: s.id, label: s.label })),
    state.size, (v) => { state.size = v; remember({ screen: v }); });
  const capSel = select('Companies tested', CAPS.map((c) => ({ value: String(c), label: `${c} largest` })),
    String(state.cap), (v) => { state.cap = Number(v); remember({ days: v }); });

  const runBtn = el('button', { type: 'button', class: 'qd-btn qd-btn--primary as-run', onclick: () => start() },
    ['Run scan', arrow()]);
  const search = el('input', {
    type: 'search', class: 'as-search', placeholder: 'Filter results…', 'aria-label': 'Filter results',
    oninput: () => { state.search = search.value.trim().toLowerCase(); paint(); },
  });

  const progress = el('div', { class: 'as-prog', hidden: true });
  const summary = el('p', { class: 'as-summary-line', hidden: true });
  const table = el('div', { class: 'as-table' });

  host.append(
    el('p', { class: 'qd-lede', text: 'The screener narrows the universe server-side; the Alpha '
      + 'Signal is then computed in your browser for the largest companies that survive, up to '
      + 'the cap you choose. Seven requests per company — a scan is not free, which is why it '
      + 'runs on a button rather than on arrival.' }),
    el('div', { class: 'as-controls' }, [sectorSel, sizeSel, capSel, runBtn]),
    kpiStrip(),
    progress, summary,
    el('div', { class: 'as-tablehead' }, [search]),
    table,
    standingNotice(),
  );

  table.replaceChildren(emptyState('skipped', hasApiKey()
    ? 'Choose a universe and run a scan.'
    : 'A market scan needs a live FMP connection. Add your key in Settings — the company-level '
      + 'Alpha Signal tab still works on the bundled snapshot.', false));

  /* ---- the scan ---- */
  async function start() {
    if (!hasApiKey()) {
      table.replaceChildren(emptyState('skipped', 'A market scan needs a live FMP connection.'));
      return;
    }
    const mine = ++generation;
    run = { cancelled: false };
    rows = [];
    runBtn.disabled = true;
    runBtn.replaceChildren(el('span', { text: 'Scanning…' }));
    summary.hidden = true;
    progress.hidden = false;
    progress.replaceChildren(el('p', { text: 'Screening the universe…' }));
    table.replaceChildren(emptyState('loading', 'Building the candidate list.'));

    try {
      const floor = SIZE_FLOORS.find((s) => s.id === state.size) || SIZE_FLOORS[0];
      const hits = await fetchScreener({
        country: 'US', isEtf: false, isFund: false, isActivelyTrading: true,
        ...(floor.min ? { marketCapMoreThan: floor.min } : {}),
        ...(state.sector ? { sector: state.sector } : {}),
        limit: 5000,
      });
      if (mine !== generation) return;

      if (hits.status !== 'ok') {
        table.replaceChildren(emptyState(hits.status, hits.message || 'The screener did not answer.'));
        return;
      }

      const universe = dedupeStocks(hits.data.filter((h) => h.symbol && !h.isEtf && !h.isFund));
      const candidates = [...universe]
        .sort((x, y) => (y.marketCap ?? 0) - (x.marketCap ?? 0))
        .slice(0, state.cap);

      if (!candidates.length) {
        table.replaceChildren(emptyState('unavailable', 'No companies matched that universe.'));
        return;
      }

      const stats = await loadSectorStats();
      const lookups = new Map();
      const lookupFor = (sector) => {
        if (!lookups.has(sector)) lookups.set(sector, sectorLookup(stats, sector));
        return lookups.get(sector);
      };

      let done = 0;
      const tick = () => {
        progress.replaceChildren(
          el('p', { text: `Scoring ${done} of ${candidates.length} companies…` }),
          el('div', { class: 'as-prog__track' }, [
            el('div', { class: 'as-prog__fill', style: { width: `${(done / candidates.length) * 100}%` } }),
          ]),
        );
      };
      tick();

      const scored = await mapLimited(candidates, async (h) => {
        const results = await Promise.all([
          ...SCAN_FEEDS.map((f) => fetchFor(f, h.symbol)),
          fetchFor('ratiosTtm', h.symbol),
        ]);
        done += 1;
        if (done % 5 === 0 || done === candidates.length) tick();
        if (run?.cancelled || mine !== generation) return null;

        const bag = {};
        SCAN_FEEDS.forEach((f, i) => { bag[f] = results[i]; });
        const ratios = results[SCAN_FEEDS.length];

        const quant = ratios?.status === 'ok' && ratios.data
          ? scoreFromRatios(ratios.data, lookupFor(h.sector || ''))
          : { score: null, scoredOn: 0 };

        const signals = runProviders(bag, {
          symbol: h.symbol,
          marketCap: isNum(h.marketCap) ? h.marketCap : null,
          quantScore: quant.score,
        });
        const result = scoreAlpha(signals);
        const cls = classify(result, quant.score);

        return {
          symbol: h.symbol,
          name: h.companyName || h.symbol,
          sector: h.sector || '',
          price: isNum(h.price) ? h.price : null,
          marketCap: isNum(h.marketCap) ? h.marketCap : null,
          quant: quant.score,
          quantOn: quant.scoredOn,
          alpha: result.score,
          coverage: result.coveragePct,
          confidence: result.confidence,
          archetype: cls.primary,
          categories: Object.fromEntries(result.categories.map((c) => [c.id, c.score])),
          counts: result.counts,
        };
      }, 3);

      if (mine !== generation) return;

      rows = scored.filter(Boolean).filter((r) => isNum(r.alpha));
      progress.hidden = true;
      summary.hidden = false;
      summary.replaceChildren(
        el('b', { text: `${rows.length} scored` }),
        el('span', { text: ` · ${candidates.length} tested of ${universe.length} in the screened `
          + `universe, largest first. ${universe.length - candidates.length} were not tested.` }),
      );
      paint();
    } catch (err) {
      if (mine !== generation) return;
      console.error('alpha scan', err);
      progress.hidden = true;
      table.replaceChildren(emptyState('error', err.message));
    } finally {
      if (mine === generation) {
        runBtn.disabled = false;
        runBtn.replaceChildren(el('span', { text: 'Run scan' }), arrow());
      }
    }
  }

  /* ---- the table ---- */
  function paint() {
    const q = state.search;
    const shown = rows
      .filter((r) => !q || r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      .sort((x, y) => sortValue(y, state.sort) - sortValue(x, state.sort));

    if (!shown.length) {
      table.replaceChildren(emptyState('unavailable', rows.length
        ? 'No company matches that filter.'
        : 'No company in the tested set produced a scoreable Alpha Signal.'));
      return;
    }

    const head = (label, key, help) => el('th', {
      scope: 'col', class: key ? 'is-sortable' : '', title: help || null,
      'aria-sort': state.sort === key ? 'descending' : null,
      ...(key ? { onclick: () => { state.sort = key; paint(); } } : {}),
    }, [label]);

    table.replaceChildren(el('div', { class: 'as-scroll' }, [
      el('table', { class: 'as-grid' }, [
        el('thead', {}, [el('tr', {}, [
          head('Company'),
          head('Alpha', 'alpha', 'The Alpha Signal, 0–100.'),
          head('Coverage', 'coverage', 'Share of the model\'s weight that could be measured for this company.'),
          head('Quant', 'quant', `The existing quant rating, 0–${MAX_SCORE}, from the lite grader — fewer ratios than a company report grades.`),
          head('Classification'),
          ...CATEGORIES.slice(0, 5).map((c) => head(short(c.title), c.id, c.question)),
          head('Signals'),
        ])]),
        el('tbody', {}, shown.map((r) => el('tr', {}, [
          el('td', {}, [el('button', {
            type: 'button', class: 'as-co', onclick: () => nav.goSymbolTab?.('Alpha Signal', r.symbol),
          }, [
            el('strong', { text: r.symbol }),
            el('small', { text: r.name }),
          ])]),
          el('td', { class: 'num' }, [el('span', { class: `as-cell as-cell--${band(r.alpha)}`, text: String(r.alpha) })]),
          el('td', { class: 'num' }, [
            el('span', { class: 'as-cov', text: `${r.coverage}%` }),
            confidencePill(r.confidence),
          ]),
          el('td', { class: 'num', title: r.quantOn ? `${r.quantOn} ratios graded` : 'Not graded' },
            [isNum(r.quant) ? dec(r.quant, 2) : '—']),
          el('td', {}, [el('span', { class: 'as-arch__tag', text: r.archetype.label, title: r.archetype.blurb })]),
          ...CATEGORIES.slice(0, 5).map((c) => el('td', { class: 'num' }, [
            isNum(r.categories[c.id])
              ? el('span', { class: `as-mini as-mini--${band(r.categories[c.id])}`, text: String(Math.round(r.categories[c.id])) })
              : el('span', { class: 'as-mini as-mini--na', text: '—', title: 'Not measurable for this company' }),
          ])),
          el('td', { class: 'num as-counts', text: `${r.counts.positive}+ ${r.counts.negative}− ${r.counts.missing}?` }),
        ]))),
      ]),
    ]));
  }

  function kpiStrip() {
    return el('div', { class: 'as-kpis' }, [
      kpi('Categories', String(CATEGORIES.length), 'Each with its own provider and weight.'),
      kpi('Requests per company', '7', 'Six signal feeds plus the ratios the quant rating reads.'),
      kpi('Weighting', `v${CALC_VERSION}`, 'Unvalidated. No backtest supports these weights.'),
      kpi('Stored history', 'None', 'This app persists nothing, so there are no score changes to show.'),
    ]);
  }

  host.dispose = () => { generation += 1; if (run) run.cancelled = true; };
  return host;
}

const kpi = (k, v, help) => el('div', { class: 'as-kpi', title: help }, [
  el('strong', { text: v }), el('span', { text: k }),
]);

const band = (v) => (!isNum(v) ? 'na' : v >= 70 ? 'high' : v >= 55 ? 'mid' : v >= 40 ? 'low' : 'weak');
const short = (t) => t.replace('Fundamental inflection', 'Fundamentals')
  .replace('Revision momentum', 'Revisions')
  .replace('Commercial momentum', 'Commercial')
  .replace('Institutional activity', 'Institutions')
  .replace('Insider conviction', 'Insiders');

function sortValue(r, key) {
  if (key === 'alpha') return r.alpha ?? -1;
  if (key === 'coverage') return r.coverage ?? -1;
  if (key === 'quant') return r.quant ?? -1;
  return r.categories?.[key] ?? -1;
}

function select(label, options, value, onChange) {
  const sel = el('select', { class: 'as-sel', 'aria-label': label, onchange: () => onChange(sel.value) },
    options.map((o) => el('option', { value: o.value, text: o.label, selected: o.value === value ? 'selected' : null })));
  return el('label', { class: 'as-ctl' }, [el('span', { text: label }), sel]);
}

/* ==========================================================================
   Method
   ========================================================================== */

const panel = (title, children) => el('section', { class: 'qd-panel', 'aria-label': title }, [
  el('h2', { class: 'qd-panel__t', text: title }),
  ...[].concat(children).filter(Boolean),
]);

function methodTab(nav) {
  return el('div', { class: 'qd-read' }, [
    panel('What the number is', [
      el('p', { class: 'qd-p', text: 'The Alpha Signal is a weighted reading of recent, dated '
        + 'evidence about a company: eleven categories, each scored 0–100 from its own signals, '
        + 'combined by the weights below. It is not a forecast and it is not a quality rating.' }),
      el('p', { class: 'qd-p', text: 'It is deliberately on a different scale from the quant '
        + 'rating, which is 0–5. The two answer different questions — "how good is this company '
        + 'relative to its sector" and "how much has recently changed here" — and a shared scale '
        + 'would invite averaging them, which produces a number that answers neither.' }),
    ]),

    panel('The eleven categories and their weights', [
      /* Weight order here, unlike everywhere else in the feature, which reads
         in the categories' own editorial order. This is the one table whose
         subject *is* the weight, and bars that do not descend make a bar
         chart harder to read than the numbers beside it. */
      el('div', { class: 'as-wtable' }, [...CATEGORIES]
        .sort((x, y) => ALPHA_WEIGHTS[y.id] - ALPHA_WEIGHTS[x.id])
        .map((c) => el('div', { class: 'as-wrow' }, [
        el('div', { class: 'as-wrow__id' }, [
          el('strong', { text: c.title }),
          el('span', { text: c.question }),
        ]),
        el('div', { class: 'as-wrow__bar' }, [
          el('div', { class: 'as-wrow__fill', style: { width: `${(ALPHA_WEIGHTS[c.id] / 0.20) * 100}%` } }),
        ]),
        el('div', { class: 'as-wrow__w', text: `${Math.round(ALPHA_WEIGHTS[c.id] * 100)}%` }),
      ]))),
      el('p', { class: 'qd-note', text: `Weighting version ${CALC_VERSION}. The version is printed `
        + 'beside every score, because two numbers produced under different weights are not '
        + 'comparable and nothing else would reveal it.' }),
    ]),

    panel('How a category becomes a score', [
      el('ul', { class: 'as-steps' }, [
        ['Each signal scores 0–100 through a stated band.',
          'The band is printed in the signal\'s own calculation — "the full scale is ±4 points of '
          + 'margin" — so a reader can check whether it is reasonable rather than trusting a curve.'],
        ['Signals are averaged by confidence × freshness.',
          'A fresh, high-confidence measurement outvotes a stale, low-confidence one inside the '
          + 'same category. Freshness decays from full weight at 35 days to a floor at two years.'],
        ['A category with no data is dropped, not scored zero.',
          'Its weight is redistributed across the categories that did score, and the share that '
          + 'was dropped becomes the coverage figure. A gated feed lowers confidence; it never '
          + 'manufactures a bad score.'],
        ['Confidence is capped by coverage, last.',
          'Below 40% coverage the answer is low confidence and below 65% it cannot be high, '
          + 'whatever the evidence quality. The cap is applied after everything else so no '
          + 'combination of inputs can route around it.'],
      ].map(([h, b]) => el('li', {}, [el('strong', { text: h }), el('span', { text: b })]))),
    ]),

    panel('What counts as evidence', [
      el('p', { class: 'qd-p', text: 'In order of preference: SEC filings, company releases, '
        + 'earnings releases, vendor-structured financial data, then market data. News is used '
        + 'for context and counting only, never as a fact about the business.' }),
      el('p', { class: 'qd-warn', html: '<b>No social media, ever.</b> Reddit, X and message '
        + 'boards are not read by any provider in this engine and will not be. If a sentiment '
        + 'or attention source is ever added it will be labelled as attention data, kept out of '
        + 'the fundamental categories, and never presented as evidence about a company\'s '
        + 'financial condition.' }),
      el('div', { class: 'qd-actions' }, [
        el('button', { type: 'button', class: 'qd-btn qd-btn--primary',
          onclick: () => nav.goSymbolTab?.('Alpha Signal') }, ['See it on a company', arrow()]),
        el('button', { type: 'button', class: 'qd-btn',
          onclick: () => nav.goView?.('quant', 'ratings') }, ['The quant rating', arrow()]),
      ]),
    ]),
  ]);
}

/* ==========================================================================
   Limits
   ========================================================================== */

function limitsTab(nav) {
  return el('div', { class: 'qd-read' }, [
    panel('The weights are not validated', [
      el('p', { class: 'qd-warn', html: '<b>No backtest supports them.</b> They are a stated '
        + 'starting allocation with an argument behind each one, and nothing more. Anyone '
        + 'presenting a hand-set weight vector as optimal is guessing; this page says so rather '
        + 'than implying otherwise by omission.' }),
      el('p', { class: 'qd-p', text: 'The category scores are more informative than the '
        + 'composite, because a category is a measurement and the composite is a measurement '
        + 'plus an opinion about what measurements are worth.' }),
    ]),

    panel('There is no history, so there is no backtest', [
      el('p', { class: 'qd-p', text: 'Every score on this page is computed in your browser from '
        + 'live feeds and discarded when you reload. Nothing is stored between sessions, which '
        + 'is the same constraint the quant desk\'s rating-changes tab runs into, and it has the '
        + 'same two consequences: no score history, and no way to test whether any of this '
        + 'works.' }),
      el('div', { class: 'as-plan' }, [
        ['A nightly job', 'Runs the eleven providers across a defined universe and writes one '
          + 'row per company per day: the composite, the eleven category scores, the coverage, '
          + 'and the calculation version.'],
        ['Somewhere to write', 'The row is small. A year of daily scores for a thousand '
          + 'companies is a few hundred megabytes.'],
        ['Point-in-time storage', 'The hard part, and the one that makes a backtest honest: '
          + 'signals have to be stored as they were known on the day, not recomputed later from '
          + 'restated filings. Recomputing is look-ahead bias wearing a timestamp.'],
        ['A survivorship-safe universe', 'Including companies that were later delisted or '
          + 'acquired. A universe built from today\'s listings has already dropped every '
          + 'failure.'],
      ].map(([h, b]) => el('div', { class: 'as-plan__i' }, [
        el('h4', { text: h }), el('p', { text: b }),
      ]))),
      el('p', { class: 'qd-note', text: 'Until those exist, this feature makes no performance '
        + 'claim of any kind — not a hit rate, not a return, not a comparison with a benchmark. '
        + 'The structures are defined in alpha-score.js and the scores are reproducible; what is '
        + 'missing is somewhere to put them.' }),
    ]),

    panel('What the providers cannot see', [
      el('p', { class: 'qd-p', text: 'Each of these is reported on a company\'s page as a named '
        + 'gap that lowers coverage, rather than being approximated from something else:' }),
      el('ul', { class: 'qd-rules' }, [
        'Consensus EPS and revenue revision history',
        'Contract awards, backlog and book-to-bill',
        'Patents and regulatory decisions',
        'Job postings by function',
        'Search and retail attention',
        'Investor days and corporate actions',
        'Supply-chain relationships',
      ].map((t) => el('li', { text: t }))),
      el('p', { class: 'qd-note', text: 'The first of those is worth singling out. FMP publishes '
        + 'today\'s consensus and a monthly history of analyst ratings, but no time series of '
        + 'consensus estimates — so "estimate revision momentum", which is what this category is '
        + 'usually named for, is not computable here. What the engine measures instead is the '
        + 'rating mix and the price-target trend, and it says so on the card rather than letting '
        + 'one measurement wear the other\'s name.' }),
    ]),

    panel('The scan is capped, and that biases it', [
      el('p', { class: 'qd-p', text: 'A scan sorts the screened universe by market capitalisation '
        + 'and tests the largest companies up to the cap. That is the only ranking the screener '
        + 'gives away for free, and it means the tested set is skewed toward companies you have '
        + 'already heard of — close to the opposite of what a discovery tool should do.' }),
      el('p', { class: 'qd-p', text: 'The honest workarounds available today are to narrow the '
        + 'universe first, with the sector and size controls, so the cap bites on a smaller list. '
        + 'Scanning "Healthcare, above $300m, 300 companies" tests a much larger share of that '
        + 'universe than an unfiltered scan does of the market.' }),
      el('div', { class: 'qd-actions' }, [
        el('button', { type: 'button', class: 'qd-btn qd-btn--primary',
          onclick: () => nav.goView?.('alpha', 'scan') }, ['Back to the scanner', arrow()]),
      ]),
    ]),
  ]);
}
