/* ==========================================================================
   Vanlior — Investment Ideas

   The portfolio directory at `?view=ideas`, and one portfolio's screener at
   `?view=ideas&idea=<key>`.

   ---------------------------------------------------------------------------
   What changed when this became a top-level menu
   ---------------------------------------------------------------------------

   The twenty-three portfolios, their theses, their rules and the engine that
   runs them all live in `ideas.js` and are untouched. This file replaces two
   things only: the **index**, which is now a directory to scan rather than a
   column of essays, and the **portfolio page**, which is now a screener whose
   filters can be changed rather than a fixed result.

   ---------------------------------------------------------------------------
   The screener is the portfolio, not a second thing
   ---------------------------------------------------------------------------

   Every rule in `ideas.js` carries a `filter` descriptor beside its closure —
   `{ metric: 'roic', op: 'gte', value: 0.10 }` — so a published portfolio can
   be *read back out* as a list of filters, edited, and rebuilt. `runIdea` is
   never told any of this happened: `ideaFromFilters()` hands it the same shape
   it always took, so a derived screen and a published one run through
   identical code.

   Two consequences worth knowing:

   * **A rule built by hand with `rule()` has no descriptor.** The panel shows
     it as a fixed condition rather than inventing controls it cannot honour.
     Every rule in the shipped portfolios goes through `atLeast`/`atMost`/
     `between`/`scoreAtLeast`, so this is currently theoretical — but it is why
     the panel checks.
   * **Re-running after an edit is nearly free.** `runIdea` fetches through
     `fmp.js`, which caches per request, so changing a threshold re-tests
     companies already in memory rather than re-fetching them. The expensive
     call is the first one. That is what makes an adjustable screener
     affordable here at all.

   ---------------------------------------------------------------------------
   Why the filter state is not in the URL the way the Research feed's is
   ---------------------------------------------------------------------------

   On the Research feed every pill click pushes a URL and re-renders, because
   filtering thirty articles in memory is free. Here a run costs a screener
   call plus several requests per candidate, and a re-render per keystroke
   would spend an FMP quota on somebody thinking.

   So the panel holds its edits locally and **only a run writes the URL** — via
   `replaceState`, so a tuned screen is still shareable and still survives a
   reload, without one history entry per digit typed. Same reasoning the
   Calendar already uses for its week.
   ========================================================================== */

import { el, isNum, money } from './util.js';
import { card, notice, ohead } from './ui.js';
import { pageHead, IDEA_GROUPS, ideaGroupSlug, SECTORS } from './nav.js';
import { hasApiKey } from './fmp.js';
import {
  IDEAS, IDEA_BY_KEY, runIdea, capFor, bagsFor, universeLine,
  FILTER_METRICS, filterGroups, filtersFor, ideaFromFilters,
  filterToInput, inputToFilter, filterUnit, filterLabel, BILLION,
  resultCard, rankedCard, rulesCard, rulesListCard, basisCard,
} from './ideas.js';
import { marketTable, SCREENER_COLUMN_SETS, newTableState } from './markettable.js';
import { instrumentMark } from './markethub-ui.js';

/* ==========================================================================
   1. The URL
   ========================================================================== */

/**
 * The query parameters a tuned screen is made of.
 *
 * `f` carries the rules, the other three the universe. Separated because the
 * universe is what FMP screens server-side and the rules are what this browser
 * tests afterwards — two different machines, and a reader looking at the
 * address bar should be able to tell which is which.
 */
export const IDEA_PARAMS = ['idea', 'f', 'mcmin', 'mcmax', 'sec'];

/* `~` separates the parts of one filter and `..` the two ends of a range,
   because a metric key already contains a colon (`score:valuation`) and a
   colon separator would split it in the wrong place. */
const encodeFilter = (f) => {
  const v = f.op === 'between' ? `${f.value[0]}..${f.value[1]}` : String(f.value);
  return `${f.metric}~${f.op}~${v}`;
};

function decodeFilter(part, i) {
  const [metric, op, raw] = String(part).split('~');
  if (!FILTER_METRICS[metric] || !raw) return null;
  const value = op === 'between'
    ? raw.split('..').map(Number)
    : Number(raw);
  const bad = Array.isArray(value) ? value.some((n) => !Number.isFinite(n)) : !Number.isFinite(value);
  if (bad) return null;
  return { metric, op, value, id: `u${i}` };
}

/** Read a tuned screen out of the URL, or null where nothing was tuned. */
function stateFromUrl(idea) {
  const p = new URLSearchParams(location.search);
  const raw = p.get('f');

  const universe = {};
  const mcmin = parseFloat(p.get('mcmin'));
  const mcmax = parseFloat(p.get('mcmax'));
  if (Number.isFinite(mcmin)) universe.marketCapMoreThan = mcmin;
  if (Number.isFinite(mcmax)) universe.marketCapLowerThan = mcmax;
  const sec = p.get('sec');
  if (sec && SECTORS.includes(sec)) universe.sector = sec;

  // `f=` present but empty is a screen the reader emptied on purpose, and is
  // not the same as no `f=` at all. Only the latter falls back to the
  // portfolio's published rules.
  const filters = raw == null
    ? filtersFor(idea)
    : raw.split(';').filter(Boolean).map(decodeFilter).filter(Boolean);

  return {
    filters,
    universe: { ...pickUniverse(idea), ...universe },
    tuned: raw != null || Object.keys(universe).length > 0,
  };
}

/** The three universe fields the panel can change, read off a portfolio. */
function pickUniverse(idea) {
  const u = idea.universe || {};
  return {
    marketCapMoreThan: isNum(u.marketCapMoreThan) ? u.marketCapMoreThan : null,
    marketCapLowerThan: isNum(u.marketCapLowerThan) ? u.marketCapLowerThan : null,
    sector: u.sector || null,
  };
}

/**
 * Write the tuned screen back to the address bar.
 *
 * `replaceState`, not `pushState`: a reader who runs a screen four times while
 * adjusting it should be able to press Back once and land on the page they
 * arrived from, not step backwards through their own thinking.
 */
function stateToUrl(idea, state) {
  const url = new URL(location.href);
  url.searchParams.set('view', 'ideas');
  url.searchParams.set('idea', idea.key);
  url.searchParams.delete('sub');
  url.searchParams.set('f', state.filters.filter((x) => !x.fixed).map(encodeFilter).join(';'));

  const set = (k, v) => (v == null ? url.searchParams.delete(k) : url.searchParams.set(k, String(v)));
  set('mcmin', state.universe.marketCapMoreThan);
  set('mcmax', state.universe.marketCapLowerThan);
  set('sec', state.universe.sector);

  history.replaceState(history.state, '', url);
}

/* ==========================================================================
   2. The page
   ========================================================================== */

export function renderPortfoliosPage(sub, nav = {}) {
  const key = new URLSearchParams(location.search).get('idea');
  const idea = key ? IDEA_BY_KEY[key] : null;

  const body = (key && !idea) ? unknownPortfolio(key, nav)
    : idea ? portfolioPage(idea, nav)
      : indexPage(sub, nav);

  /* On the market canvas, like the Markets and News pages. `bootNavPage`
     mounts every nav page in a plain shell, so the canvas is applied here
     rather than there — this is the only one of the nine that wants it so
     far, and moving the rest is a separate decision. */
  return el('main', { class: 'mh-page pf-page' }, [body]);
}

function unknownPortfolio(key, nav) {
  return el('div', { class: 'ovw' }, [
    card('pf-404', [
      ohead('No such portfolio'),
      notice(`Nothing is filed under <code>${String(key).replace(/[<>&]/g, '')}</code>.`),
      el('button', {
        type: 'button', class: 'btn btn--primary mt2', text: 'All portfolios →',
        onclick: () => nav.goView?.('ideas', 'all'),
      }),
    ], 'ocard ovw__c12'),
  ]);
}

/* ==========================================================================
   3. The directory
   ========================================================================== */

/**
 * Portfolios filed by group, with a search box over all of them.
 *
 * The search is over titles and theses, in memory, and costs nothing — which
 * is the opposite of everything else on this page and worth saying, because a
 * reader who has learned that running a screen is expensive will hesitate over
 * a search box that is not.
 */
function indexPage(sub, nav) {
  const group = sub && sub !== 'all' ? IDEA_GROUPS.find((g) => ideaGroupSlug(g) === sub) : null;
  const host = el('div', { class: 'ovw' });

  const search = el('input', {
    type: 'search', class: 'pfsearch__i', id: 'pf-search',
    placeholder: 'Search portfolios…', autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'Search portfolios',
  });

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const match = (i) => !q
      || i.title.toLowerCase().includes(q)
      || i.thesis.toLowerCase().includes(q)
      || (i.tag || '').toLowerCase().includes(q)
      || (i.group || '').toLowerCase().includes(q);

    const pool = IDEAS.filter((i) => (!group || i.group === group) && match(i));
    const sections = sectionsOf(pool);

    host.replaceChildren(
      card('pf-head', [
        el('div', { class: 'pfhead' }, [
          el('div', {}, [
            el('h2', { class: 'pfhead__t', text: group || 'All portfolios' }),
            el('p', { class: 'pfhead__b', text: group
              ? `${pool.length} portfolio${pool.length === 1 ? '' : 's'} in this group. `
                + 'Open one to see its rules, change them, and run it.'
              : `${IDEAS.length} screens over the whole listed market, filed in `
                + `${IDEA_GROUPS.length} groups. Each is a thesis expressed as rules this data `
                + 'can actually test — open one to change those rules and re-run it.' }),
          ]),
          el('div', { class: 'pfsearch' }, [search]),
        ]),
      ], 'ocard ovw__c12 pfcard'),

      ...(hasApiKey() ? [] : [card('pf-key', [notice(
        'These screens run across the whole listed market, which needs a live Financial Modeling '
        + 'Prep connection. Every portfolio below still shows its thesis and the exact rules it '
        + 'tests; add an API key under the gear icon to run them.')], 'ocard ovw__c12 ovw--tight')]),

      ...(pool.length
        ? sections.flatMap(({ name, ideas }) => [
            el('h3', { class: 'pfgroup ovw__c12' }, [
              el('span', { text: name }),
              el('i', { text: `${ideas.length}` }),
            ]),
            // The rows get their own full-width container: dropped straight
            // into `.ovw` they would each take one of its twelve columns.
            el('div', { class: 'pfrows ovw__c12' }, ideas.map((idea) => portfolioTile(idea, nav))),
          ])
        : [card('pf-empty', [
            el('p', { class: 'fempty__t', text: 'No portfolio matches that.' }),
            el('p', { class: 'fempty__b', text: 'Try a shorter term, or clear the box to see all '
              + `${IDEAS.length}.` }),
          ], 'ocard ovw__c12')]),
    );
  };

  // Live as you type. In memory over twenty-three items, so there is nothing
  // to debounce and nothing to spend.
  search.addEventListener('input', draw);
  draw();

  return el('div', {}, [pageHead('ideas', sub || 'all', nav), host]);
}

/** Group the pool, preserving `IDEA_GROUPS` order and collecting strays. */
function sectionsOf(pool) {
  const seen = new Map();
  for (const idea of pool) {
    const g = idea.group || 'More';
    if (!seen.has(g)) seen.set(g, []);
    seen.get(g).push(idea);
  }
  const ordered = IDEA_GROUPS.filter((g) => seen.has(g));
  const rest = [...seen.keys()].filter((g) => !IDEA_GROUPS.includes(g));
  return [...ordered, ...rest].map((name) => ({ name, ideas: seen.get(name) }));
}

/**
 * The first sentence of a thesis.
 *
 * Every thesis in `ideas.js` is written claim-first — the opening sentence is
 * the screen and the rest is the argument for it — so the first sentence is a
 * summary that nobody had to write twice. The full thesis is on the portfolio
 * page, which is where somebody has decided to read rather than to scan.
 */
function firstSentence(text) {
  const m = String(text || '').match(/^[^.]+\./);
  return m ? m[0] : String(text || '');
}

/**
 * One portfolio in the directory, as a row.
 *
 * A row rather than a tile: forty portfolios in ten groups is a list to scan
 * down, and a grid of forty cards is a wall. The columns are the three facts
 * a reader chooses on — what it screens for, how wide the net is, and what it
 * costs to run.
 */
function portfolioTile(idea, nav) {
  const rules = idea.ranked
    ? `Ranked, top ${idea.resultLimit}`
    : `${idea.rules.length} rule${idea.rules.length === 1 ? '' : 's'}`;

  return el('button', {
    type: 'button', class: 'pfrow',
    onclick: () => nav.goIdea?.(idea.key),
  }, [
    el('span', { class: 'pfrow__main' }, [
      el('span', { class: 'pfrow__t' }, [
        el('strong', { text: idea.title }),
        idea.tag ? el('span', { class: `pill pill--${idea.scoreIdea ? 'gold' : 'muted'}`, text: idea.tag }) : null,
      ].filter(Boolean)),
      el('span', { class: 'pfrow__s', text: firstSentence(idea.thesis) }),
    ]),
    el('span', { class: 'pfrow__m', text: rules }),
    el('span', { class: 'pfrow__m', text: universeShort(idea) }),
    el('span', { class: 'pfrow__m pfrow__m--cost', text: `tests ${capFor(idea)}` }),
    el('span', { class: 'pfrow__go', 'aria-hidden': 'true', text: '›' }),
  ]);
}

/** The universe in three or four words, for a tile. */
function universeShort(idea) {
  const u = idea.universe || {};
  if (u.sector) return u.sector;
  if (isNum(u.marketCapMoreThan) && isNum(u.marketCapLowerThan)) {
    return `${money(u.marketCapMoreThan)}–${money(u.marketCapLowerThan)}`;
  }
  if (isNum(u.marketCapMoreThan)) return `over ${money(u.marketCapMoreThan)}`;
  return 'US-listed';
}

/* ==========================================================================
   4. One portfolio, as a screener
   ========================================================================== */

function portfolioPage(idea, nav) {
  // `bootNavPage` titled the page from the section, which for a portfolio is
  // whichever group it happens to sit in. The portfolio is the page.
  document.title = `${idea.title} — Vanlior Investment Ideas`;

  const state = stateFromUrl(idea);
  const host = el('div', { class: 'ovw' });
  const results = el('div', { class: 'ovw pfresults' });

  let running = false;

  const run = async () => {
    // Reset calls this too, and Reset is not disabled without a key — so the
    // guard lives here rather than only on the button. The gate card below
    // stays up instead of being replaced by a "skipped" result that says the
    // same thing less clearly.
    if (running || !hasApiKey()) return;
    running = true;
    stateToUrl(idea, state);

    const progress = el('p', { class: 't-xs softer center', text: 'Screening…' });
    results.replaceChildren(card('pf-running', [
      el('div', { class: 'sk sk--line', style: { width: '40%' } }),
      el('div', { class: 'sk sk--block', style: { marginTop: '16px' } }),
      progress,
    ], 'ocard ovw__c12'));

    const derived = ideaFromFilters(idea, state);
    let result;
    try {
      result = await runIdea(derived, {
        onProgress: (done, total) => {
          progress.textContent = `Testing ${done} of ${total} companies…`;
        },
      });
    } catch (err) {
      console.error(err);
      result = { state: 'error', idea: derived, message: err.message };
    }
    running = false;
    drawResults(result);
  };

  /* The table keeps its own tab, sort and page across re-runs: a reader who
     sorted by dividend yield and then nudged a threshold should get the new
     result in the view they had set, not back on Overview. */
  const tableState = newTableState(SCREENER_COLUMN_SETS);

  const drawResults = (result) => {
    const shown = result.idea || idea;
    /* The screen's own rows, on the same dense table the Stock Screener and
       the market boards use. `runIdea` has already filled `ratios`, `metrics`
       and whatever else its rules needed; handing those over as `bags` means
       the table's Valuation and Profitability tabs are free rather than a
       second fetch per company. */
    const rows = (result.state === 'ok' ? result.rows : []).map((c) => ({
      ...c,
      bags: { ratios: c.ratios, metrics: c.metrics, growth: c.growth, returns: c.returns },
    }));

    results.replaceChildren(...[
      result.state === 'ok' && rows.length
        ? el('section', { class: 'ocard card sec ovw__c12 pftable' }, [
          el('div', { class: 'ocard__head' }, [
            el('h2', {}, [`${rows.length} ${rows.length === 1 ? 'company' : 'companies'}`]),
            el('span', { class: 't-tiny subtle',
              text: `${result.passedCount} of ${result.tested} tested passed every rule` }),
          ]),
          marketTable({
            rows,
            sets: SCREENER_COLUMN_SETS,
            state: tableState,
            identity: (row) => el('button', {
              type: 'button', class: 'mt__idbtn', 'aria-label': `Open ${row.symbol}`,
              onclick: () => nav.goSymbol?.(row.symbol),
            }, [
              instrumentMark({ symbol: row.symbol, kind: 'stock' }),
              el('span', { class: 'mt__idtext' }, [
                el('strong', { text: row.symbol }),
                el('small', { text: row.name || '' }),
              ]),
            ]),
            emptyText: 'No company cleared every rule.',
          }),
        ])
        // Not-ok and empty states keep the shared card: it already words every
        // one of gated / skipped / empty / error correctly.
        : resultCard(result, nav),
      shown.ranked
        ? rankedCard(result)
        : (result.state === 'ok' && result.all?.length ? rulesCard(result) : rulesListCard(shown)),
      basisCard(result),
    ].filter(Boolean));
  };

  const redraw = () => {
    panel.replaceChildren(...filterPanel(idea, state, { run, redraw }));
  };

  const panel = el('div', { class: 'ocard card sec ovw__c12 pfpanel' });
  redraw();

  host.append(
    card('pf-top', [portfolioHead(idea, state, nav)], 'ocard ovw__c12 pfcard'),
    panel,
  );

  // Run on arrival, which is what `?view=ideas&idea=…` has always done — a
  // shared link should land on the answer, not on a form and a button. Without
  // a key there is nothing to run, and the panel says so instead.
  if (hasApiKey()) run();
  else {
    results.replaceChildren(card('pf-nokey', [
      ohead(idea.title),
      notice('This screen runs across the whole market and needs a live FMP connection. Add your '
        + 'API key in <code>Settings</code>. The bundled snapshot covers one company, so there is '
        + 'nothing to screen offline.'),
    ], 'ocard ovw__c12'));
  }

  return el('div', {}, [pageHead('ideas', ideaGroupSlug(idea.group || ''), nav), host, results]);
}

/* ---------- the head, with the switcher ------------------------------------ */

function portfolioHead(idea, state, nav) {
  return el('header', { class: 'pftop' }, [
    el('button', {
      type: 'button', class: 'omore omore--back', text: 'All portfolios',
      onclick: () => nav.goView?.('ideas', 'all'),
    }),

    el('div', { class: 'pftop__row' }, [
      el('div', {}, [
        el('h1', { class: 'pftop__t', text: idea.title }),
        el('div', { class: 'pftop__tags' }, [
          idea.tag ? el('span', { class: `pill pill--${idea.scoreIdea ? 'gold' : 'muted'}`, text: idea.tag }) : null,
          // The group chip is dropped when it repeats the tag — several
          // portfolios are tagged with the name of the group they sit in
          // ("Income" in both), and two identical chips side by side read as a
          // rendering fault rather than as two facts.
          idea.group && idea.group !== idea.tag ? el('button', {
            type: 'button', class: 'aptopic', text: idea.group,
            onclick: () => nav.goView?.('ideas', ideaGroupSlug(idea.group)),
          }) : null,
        ]),
      ]),
      switcher(idea, nav),
    ]),

    el('p', { class: 'pftop__thesis', text: idea.thesis }),
    idea.note ? el('p', { class: 't-tiny subtle', text: idea.note }) : null,
  ]);
}

/**
 * Switch portfolio without going back to the directory.
 *
 * A grouped `<select>` rather than a custom menu: twenty-three options in ten
 * groups is exactly what `optgroup` is for, it is keyboard-navigable and
 * screen-reader-correct for free, and on a phone it opens the platform's own
 * picker instead of a list this page would have to scroll itself.
 *
 * Switching **discards the current edits**, because they describe a different
 * portfolio's rules and carrying them across would produce a screen that is
 * neither. `goIdea` writes a clean URL, so that happens by construction.
 */
function switcher(idea, nav) {
  const sel = el('select', {
    class: 'pfswitch__i', id: 'pf-switch', 'aria-label': 'Switch portfolio',
    onchange: (e) => { if (e.target.value !== idea.key) nav.goIdea?.(e.target.value); },
  }, sectionsOf(IDEAS).map(({ name, ideas }) => el('optgroup', { label: name },
    ideas.map((i) => el('option', { value: i.key, text: i.title })))));
  sel.value = idea.key;

  return el('div', { class: 'pfswitch' }, [
    el('label', { class: 'pfswitch__l', for: 'pf-switch', text: 'Portfolio' }),
    sel,
  ]);
}

/* ---------- the filter panel ------------------------------------------------ */

/* ==========================================================================
   The chip toolbar

   TradingView compresses a screener's whole filter set into one row of chips,
   each reading as a sentence and opening a small editor. That is the shape
   here: the rules and the universe are unchanged underneath — `filtersFor`,
   `ideaFromFilters` and the descriptor round-trip all still run — only the
   way they are presented has moved.

   A popover rather than an always-open panel because forty portfolios seed
   between one and six rules each, and six rows of three selects pushed the
   results below the fold on every one of them.
   ========================================================================== */

/** The one open popover, so a second chip closes the first. */
let openPop = null;
function closePop() {
  if (!openPop) return;
  openPop.pop.remove();
  openPop.chip.setAttribute('aria-expanded', 'false');
  openPop = null;
}
document.addEventListener('click', (e) => {
  if (!openPop) return;
  if (!openPop.pop.contains(e.target) && !openPop.chip.contains(e.target)) closePop();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });

/**
 * A chip that opens an editor.
 *
 * `build()` returns the editor's contents, and is called on open rather than
 * up front so the editor always reflects the filter's current value — a chip
 * edited, closed and reopened would otherwise show the old number.
 */
function chip(label, build, { tone = '' } = {}) {
  const btn = el('button', {
    type: 'button', class: `pfchip${tone ? ` pfchip--${tone}` : ''}`,
    'aria-expanded': 'false', 'aria-haspopup': 'dialog',
  }, [el('span', { text: label }), el('span', { class: 'pfchip__c', 'aria-hidden': 'true', text: '⌄' })]);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = openPop?.chip === btn;
    closePop();
    if (wasOpen) return;
    const pop = el('div', { class: 'pfpop', role: 'dialog' }, [].concat(build(closePop)).filter(Boolean));
    btn.parentElement.append(pop);
    btn.setAttribute('aria-expanded', 'true');
    openPop = { chip: btn, pop };
    pop.querySelector('select, input, button')?.focus();
  });

  return el('span', { class: 'pfchipwrap' }, [btn]);
}

function filterPanel(idea, state, { run, redraw }) {
  const editable = state.filters.filter((f) => !f.fixed);
  const fixed = state.filters.filter((f) => f.fixed);

  const runBtn = el('button', {
    type: 'button', class: 'btn btn--primary',
    text: 'Run screen',
    disabled: hasApiKey() ? null : true,
    title: hasApiKey() ? null : 'Needs a live FMP connection',
    onclick: run,
  });

  const reset = el('button', {
    type: 'button', class: 'btn btn--ghost', text: 'Reset to the portfolio',
    disabled: state.tuned ? null : true,
    onclick: () => {
      state.filters = filtersFor(idea);
      state.universe = pickUniverse(idea);
      state.tuned = false;
      redraw();
      run();
    },
  });

  const derived = ideaFromFilters(idea, state);

  /* Universe chips first — they are what FMP screens server-side, so they
     bound everything the rules then test. */
  const u = state.universe;
  const capChip = () => chip(
    isNum(u.marketCapMoreThan) || isNum(u.marketCapLowerThan)
      ? `Market cap ${isNum(u.marketCapMoreThan) ? `over ${money(u.marketCapMoreThan)}` : ''}`
        + `${isNum(u.marketCapMoreThan) && isNum(u.marketCapLowerThan) ? ', ' : ''}`
        + `${isNum(u.marketCapLowerThan) ? `under ${money(u.marketCapLowerThan)}` : ''}`
      : 'Market cap: any',
    (close) => [el('div', { class: 'pfpop__body' }, [universeRow(state, { redraw })]),
      el('button', { type: 'button', class: 'btn btn--primary pfpop__done', text: 'Done', onclick: close })],
  );
  const sectorChip = () => chip(u.sector ? `Sector: ${u.sector}` : 'Sector: any', (close) => {
    const sel = el('select', { class: 'pfsel', 'aria-label': 'Sector', onchange: (e) => {
      state.universe.sector = e.target.value || null;
      state.tuned = true;
      redraw();
      close();
    } }, [el('option', { value: '', text: 'Any sector' }),
      ...SECTORS.map((x) => el('option', { value: x, text: x }))]);
    sel.value = u.sector || '';
    return el('div', { class: 'pfpop__body' }, [sel]);
  });

  const chips = [
    capChip(),
    sectorChip(),
    ...editable.map((f) => chip(filterLabel(f),
      (close) => filterEditor(f, state, redraw, close), { tone: 'rule' })),
    // A rule with no descriptor runs verbatim and cannot be edited. It is
    // shown rather than hidden: a screen quietly running a rule the toolbar
    // does not list is the one failure mode worth being loud about.
    ...fixed.map((f) => el('span', { class: 'pfchip pfchip--fixed', title: 'Not adjustable' },
      [el('span', { text: f.label })])),
    chip('+ Filter', (close) => {
      const sel = el('select', { class: 'pfsel', 'aria-label': 'Add a filter', onchange: (e) => {
        if (!e.target.value) return;
        state.filters = [...state.filters, { metric: e.target.value, op: 'gte', value: null, id: `n${state.filters.length}` }];
        state.tuned = true;
        redraw();
        close();
      } }, [el('option', { value: '', text: 'Choose a metric…' }),
        ...filterGroups().map(({ name, metrics }) => el('optgroup', { label: name },
          metrics.map((x) => el('option', { value: x.key, text: x.label }))))]);
      return el('div', { class: 'pfpop__body' }, [sel,
        el('p', { class: 'pfpop__n', text: 'A filter with no number is ignored rather than failing every company — type a value to make it count.' })]);
    }, { tone: 'add' }),
  ];

  return [
    el('div', { class: 'pftools' }, [
      el('div', { class: 'pftools__chips' }, chips),
      el('div', { class: 'pftools__run' }, [
        state.tuned ? el('span', { class: 'pill pill--neutral', text: 'Edited' })
          : el('span', { class: 'pill pill--muted', text: 'As published' }),
        reset, runBtn,
      ]),
    ]),
    el('p', { class: 'pftools__cost', text: `${idea.ranked ? 'Eligibility rules' : 'Every rule must pass'} · `
      + `tests the largest ${capFor(derived)} of the universe, about `
      + `${1 + capFor(derived) * bagsFor(derived).length} FMP requests. Feeds already fetched are `
      + 'reused, so changing a threshold and running again is close to free.' }),
  ];
}

/* ---------- the universe (what FMP screens server-side) --------------------- */

function universeRow(state, { redraw }) {
  const u = state.universe;

  const capInput = (key, label, id) => {
    const input = el('input', {
      type: 'number', class: 'pfnum', id, min: '0', step: '0.1',
      placeholder: 'any',
      value: isNum(u[key]) ? String(Number((u[key] / BILLION).toFixed(3))) : '',
      'aria-label': label,
    });
    input.addEventListener('change', () => {
      const n = parseFloat(input.value);
      u[key] = Number.isFinite(n) && n > 0 ? n * BILLION : null;
      state.tuned = true;
      redraw();
    });
    return el('div', { class: 'pffield' }, [
      el('label', { class: 'pffield__l', for: id, text: label }),
      el('div', { class: 'pfinput' }, [input, el('i', { text: 'b' })]),
    ]);
  };

  const sector = el('select', {
    class: 'pfsel', id: 'pf-sector', 'aria-label': 'Sector',
    onchange: (e) => { u.sector = e.target.value || null; state.tuned = true; redraw(); },
  }, [
    el('option', { value: '', text: 'Any sector' }),
    ...SECTORS.map((s) => el('option', { value: s, text: s })),
  ]);
  sector.value = u.sector || '';

  return el('div', { class: 'pfuniverse' }, [
    el('p', { class: 'osub', text: 'Universe — screened by the vendor, before anything below runs' }),
    el('div', { class: 'pfuniverse__row' }, [
      capInput('marketCapMoreThan', 'Market cap over', 'pf-mcmin'),
      capInput('marketCapLowerThan', 'Market cap under', 'pf-mcmax'),
      el('div', { class: 'pffield' }, [
        el('label', { class: 'pffield__l', for: 'pf-sector', text: 'Sector' }),
        sector,
      ]),
    ]),
    el('p', { class: 'pffield__n', text: 'US-listed operating companies only — funds and ETFs are '
      + 'excluded by the screener and checked again here. Size and sector are the only two things '
      + 'the vendor screens on; everything below runs in this browser afterwards.' }),
  ]);
}

/* ---------- one editable rule ----------------------------------------------- */

const OPS = [
  { key: 'gte', label: 'at least' },
  { key: 'lte', label: 'at most' },
  { key: 'between', label: 'between' },
];

/**
 * One filter's editor, inside its chip's popover.
 *
 * The same three controls the expanded panel used to show in a row — metric,
 * comparison, value — plus remove. `redraw()` rebuilds the toolbar so the
 * chip's own text follows the edit; `close()` is passed so removing a filter
 * does not leave a popover anchored to a chip that no longer exists.
 */
function filterEditor(f, state, redraw, close) {
  const m = FILTER_METRICS[f.metric];
  if (!m) return null;

  const drop = () => {
    state.filters = state.filters.filter((x) => x !== f);
    state.tuned = true;
    redraw();
  };

  /* Changing the metric keeps the operator and drops the value: a 10 that
     meant "10% ROIC" means nothing as a P/E, and carrying it across would
     silently run a screen nobody asked for. */
  const metricSel = el('select', {
    class: 'pfsel pfsel--metric', 'aria-label': 'Metric',
    onchange: (e) => {
      f.metric = e.target.value;
      f.value = f.op === 'between' ? [null, null] : null;
      state.tuned = true;
      redraw();
    },
  }, filterGroups().map(({ name, metrics }) => el('optgroup', { label: name },
    metrics.map((x) => el('option', { value: x.key, text: x.label })))));
  metricSel.value = f.metric;

  const opSel = el('select', {
    class: 'pfsel pfsel--op', 'aria-label': 'Comparison',
    onchange: (e) => {
      const next = e.target.value;
      const one = Array.isArray(f.value) ? f.value[0] : f.value;
      f.value = next === 'between' ? [one, null] : one;
      f.op = next;
      state.tuned = true;
      redraw();
    },
  }, OPS.map((o) => el('option', { value: o.key, text: o.label })));
  opSel.value = f.op;

  const numBox = (idx) => {
    const current = Array.isArray(f.value) ? f.value[idx] : f.value;
    const input = el('input', {
      type: 'number', class: 'pfnum', step: 'any',
      value: filterToInput(m.kind, current),
      'aria-label': `${m.label} value`,
      placeholder: '—',
    });
    input.addEventListener('change', () => {
      const v = inputToFilter(m.kind, input.value);
      if (Array.isArray(f.value)) f.value[idx] = v;
      else f.value = v;
      state.tuned = true;
      redraw();
    });
    return input;
  };

  const unit = filterUnit(m.kind);

  return [
    el('div', { class: 'pfpop__body' }, [
      metricSel,
      el('div', { class: 'pfpop__op' }, [
        opSel,
        el('div', { class: 'pfinput' }, [
          numBox(0),
          f.op === 'between' ? el('span', { class: 'pfinput__and', text: 'and' }) : null,
          f.op === 'between' ? numBox(1) : null,
          unit ? el('i', { text: unit }) : null,
        ]),
      ]),
    ]),
    el('div', { class: 'pfpop__foot' }, [
      el('button', {
        type: 'button', class: 'pfpop__rm',
        'aria-label': `Remove the ${m.label} filter`,
        text: 'Remove',
        onclick: () => { close?.(); drop(); },
      }),
      el('button', { type: 'button', class: 'btn btn--primary pfpop__done', text: 'Done', onclick: close }),
    ]),
  ];
}

/* ==========================================================================
   5. Reused by other surfaces
   ========================================================================== */

/**
 * A portfolio's published rules in one line, for anywhere that lists screens.
 *
 * Exported so a surface that wants to mention a portfolio does not rebuild the
 * sentence — `universeLine` from `ideas.js` is the other half of the same job.
 */
export function portfolioSummary(idea) {
  return `${firstSentence(idea.thesis)} ${universeLine(idea)}`;
}
