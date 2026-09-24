/* ==========================================================================
   Vanlior — the Transcripts tab

   What management said, quarter by quarter, next to what the quarter actually
   did. Two states behind one tab: the index of calls, and one call open.

   Three things shape it.

   **The index is cheap and the text is not.** A company has eighty quarterly
   calls and each is thirty to sixty thousand words. So the dataset carries
   only the index — which quarters exist and when they were held — and the
   text of one arrives when somebody opens it. Opening a second call is a
   second request, cached for the session.

   **A transcript alone is not worth much.** "Revenue grew" is a sentence; the
   number beside it is the point. So every row in the index carries the
   quarter's own surprise against consensus and its growth on the same quarter
   a year before, matched out of the earnings feed by report date — which is
   what turns a list of calls into a list of quarters worth reading about.

   **FMP gates transcripts to its top plans.** This is the one tab that is
   unavailable on most keys, including the free one, and it says so plainly
   rather than showing an empty list.

   **The summary is written, not generated.** The dashboards this was modelled
   on run each call through a language model at page load. This report ships
   no model, and would not put a paraphrase nobody had read above a primary
   source even if it did. So summaries live in `assets/data/summaries.json`,
   written from the transcript by hand, and every one prints who wrote it and
   when. A call with no summary shows the transcript alone rather than an
   apology — the transcript was always the point.
   ========================================================================== */

import { el, isNum, money, pct, dec, fmtDate, signClass } from './util.js';
import { card, notice, feedGate, statLine, ohead, curSymbol } from './ui.js';
import { columnChart } from './charts.js';
import { fetchTranscript, logoUrl } from './fmp.js';

/** Calls listed before the reader asks for the rest. */
const DEFAULT_CALLS = 12;

/**
 * The written summaries, fetched once per session.
 *
 * A single small file rather than one per call: there are a handful of them,
 * and a request per transcript opened would be a round trip to discover that
 * most calls have none. A failed fetch is not an error — it means no
 * summaries are shipped, and the transcript renders on its own.
 */
let summariesPromise = null;
function loadSummaries() {
  summariesPromise ??= fetch('assets/data/summaries.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return summariesPromise;
}

/** Paragraphs shown before the "read the rest" control. */
const DEFAULT_PARAGRAPHS = 14;

/* ==========================================================================
   Joining a call to its quarter
   ========================================================================== */

const msOf = (v) => {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * The earnings row that belongs to a call, matched by date.
 *
 * Not an exact match: the transcript index dates a call by the day it was
 * held and the earnings feed dates a quarter by the day it was reported, and
 * the two are the same day for most companies and one apart for the rest. A
 * week either side is wide enough to catch that and far too narrow to reach
 * the next quarter.
 */
function quarterFor(earnings, date) {
  const at = msOf(date);
  if (!isNum(at)) return null;
  const WEEK = 7 * 24 * 3600 * 1000;

  let best = null;
  let bestGap = Infinity;
  for (const r of earnings) {
    const t = msOf(r.date);
    if (!isNum(t)) continue;
    const gap = Math.abs(t - at);
    if (gap <= WEEK && gap < bestGap) { best = r; bestGap = gap; }
  }
  return best;
}

/**
 * Everything the index prints for one call.
 *
 * Growth is against the same quarter a year earlier, found in the earnings
 * feed at roughly 365 days back — the comparison every company makes on the
 * call itself, and the only one that is not distorted by a seasonal business
 * selling more in December.
 */
function callMetrics(earnings, date) {
  const now = quarterFor(earnings, date);
  if (!now) return null;

  const at = msOf(now.date);
  const YEAR = 365 * 24 * 3600 * 1000;
  const priorYear = quarterFor(earnings, isNum(at) ? new Date(at - YEAR).toISOString().slice(0, 10) : null);

  const surprise = (actual, est) => (isNum(actual) && isNum(est) && est !== 0
    ? actual / Math.abs(est) - 1 : null);
  const growth = (v, was) => (isNum(v) && isNum(was) && was > 0 ? v / was - 1 : null);

  return {
    eps: now.epsActual ?? null,
    epsEstimate: now.epsEstimated ?? null,
    epsSurprise: surprise(now.epsActual, now.epsEstimated),
    epsGrowth: growth(now.epsActual, priorYear?.epsActual),
    revenue: now.revenueActual ?? null,
    revenueEstimate: now.revenueEstimated ?? null,
    revenueSurprise: surprise(now.revenueActual, now.revenueEstimated),
    revenueGrowth: growth(now.revenueActual, priorYear?.revenueActual),
  };
}

/* ==========================================================================
   The transcript text

   FMP returns one string. Where it carries newlines those are the paragraph
   breaks the transcriber made and they are used as-is; where it does not —
   and older calls often do not — the text is grouped into readable blocks so
   the reader is not handed forty thousand words as a single wall.
   ========================================================================== */

/** A speaker's name off the front of a paragraph, if it has one. */
const SPEAKER = /^\s*\[?([^:[\]]{2,60}?)\]?\s*:\s*/;

function paragraphsOf(content) {
  const text = String(content || '').trim();
  if (!text) return [];

  let blocks = text.split(/\n{1,}/).map((x) => x.trim()).filter(Boolean);

  // No newlines at all: chunk on sentence ends so the page is readable. Four
  // sentences is about a screen-width paragraph at this measure.
  if (blocks.length < 3) {
    const sentences = text.split(/(?<=[.?!])\s+(?=[A-Z[])/);
    blocks = [];
    for (let i = 0; i < sentences.length; i += 4) {
      blocks.push(sentences.slice(i, i + 4).join(' ').trim());
    }
    blocks = blocks.filter(Boolean);
  }

  return blocks.map((block) => {
    const m = SPEAKER.exec(block);
    // A "speaker" of forty words is a sentence with a colon in it, not a name.
    if (m && m[1].split(/\s+/).length <= 6) {
      return { speaker: m[1].trim(), text: block.slice(m[0].length).trim() };
    }
    return { speaker: null, text: block };
  }).filter((p) => p.text);
}

/**
 * A written summary, above the transcript it was written from.
 *
 * Tinted and boxed so it never reads as part of the call: everything below it
 * is what was said, and this is somebody's account of it. The byline is not
 * decoration — a reader who disagrees with a bullet needs to know whose
 * reading they are disagreeing with, and the transcript is directly beneath
 * to check against.
 */
function summaryCard(summary) {
  if (!summary) return null;

  return card('tr-summary', [
    ohead('Summary',
      el('span', { class: 'trsum__badge', text: `Written by ${summary.writtenBy || 'the desk'}` }),
      'A reading of the call, not a record of it. The transcript underneath is the record — '
      + 'where the two disagree, the transcript is right.'),

    el('div', { class: 'trsum' }, [
      summary.headline ? el('p', { class: 'trsum__lede', text: summary.headline }) : null,

      ...(summary.sections || []).map((sec) => el('div', { class: 'trsum__sec' }, [
        el('h4', { text: sec.title }),
        el('ul', {}, (sec.points || []).map((t) => el('li', { text: t }))),
      ])),

      summary.conclusion ? el('div', { class: 'trsum__sec' }, [
        el('h4', { text: 'In short' }),
        el('p', { class: 'trsum__concl', text: summary.conclusion }),
      ]) : null,

      el('p', { class: 'trsum__foot', text: `Read from the transcript below${
        summary.writtenAt ? ` on ${fmtDate(summary.writtenAt)}` : ''}. Written by hand — this `
        + 'report runs no language model at page load — and not graded, ranked or fed into any '
        + 'figure elsewhere in it.' }),
    ].filter(Boolean)),
  ], 'ocard');
}

/**
 * The line a call without a summary carries.
 *
 * Silence would read as a bug, which is exactly how it did read: twelve calls
 * in the index, one of them written up, and nothing anywhere saying which. So
 * a call with no summary says so and points at the ones that have one.
 */
function noSummaryNote(row, written, openCall) {
  const others = written.filter((w) => !(w.year === row.year && w.quarter === row.quarter));
  if (!others.length) {
    return el('p', { class: 'trnote', text: 'No written summary for this call.' });
  }
  return el('p', { class: 'trnote' }, [
    el('span', { text: 'No written summary for this call. ' }),
    ...others.slice(0, 3).flatMap((w, i) => [
      i ? el('span', { text: ', ' }) : null,
      el('button', {
        type: 'button', class: 'trnote__link', text: `Q${w.quarter} ${w.year}`,
        onclick: () => openCall(w),
      }),
    ].filter(Boolean)),
    el('span', { text: others.length === 1 ? ' has one.' : ' have one.' }),
  ]);
}

/* ==========================================================================
   The tab
   ========================================================================== */

export function renderTranscriptsTab(a, nav = {}) {
  const index = a.transcripts || { available: false, rows: [] };
  const earnings = Array.isArray(a.ds.get('earnings')) ? a.ds.get('earnings') : [];

  if (!index.available) {
    return el('div', { class: 'ovw' }, [
      card('tr-none', [
        ohead('Earnings call transcripts'),
        feedGate(a, 'transcriptDates', 'Earnings call transcripts')
          || notice('No earnings call transcripts are on record for this company. Coverage is '
            + 'thin outside the large caps, and companies that hold no call have none.'),
        el('p', { class: 't-tiny subtle mt2', text: 'Transcripts sit on Financial Modeling '
          + 'Prep’s upper plans. A key that reads every other tab in this report can still come '
          + 'back empty here.' }),
      ], 'ocard ovw__c12'),
    ]);
  }

  /** `${year}|${quarter}` -> the fetch result, so a call re-opened is instant. */
  const loaded = new Map();
  const host = el('div', {});

  /** The written summaries this report ships, and the calls they cover. */
  let summaries = {};
  let written = [];
  const summaryFor = (row) => summaries[`${a.facts.symbol}|${row.year}|${row.quarter}`] || null;

  const openIndex = () => {
    host.replaceChildren(indexView(a, index, earnings, openCall, written));
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  async function openCall(row) {
    const key = `${row.year}|${row.quarter}`;
    host.replaceChildren(loadingView(a, row, openIndex));
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (!loaded.has(key)) {
      // A snapshot can carry a call of its own, so the shipped example is
      // readable with no key at all. Live keys never reach this branch —
      // `snapshotExtras` is only populated when nothing loaded from FMP.
      const bundled = a.ds.snapshotExtras?.transcripts?.[key] || null;
      loaded.set(key, bundled
        ? { status: 'ok', data: bundled, fromSnapshot: true }
        : await fetchTranscript(a.facts.symbol, row.year, row.quarter));
    }

    host.replaceChildren(callView(a, row, loaded.get(key), summaryFor(row),
      index, earnings, written, openIndex, openCall));
  }

  // The index is drawn twice: once immediately, and again once the summaries
  // file has landed. Waiting for it would leave the tab blank on a slow disk
  // for a file that only adds a badge, and not waiting at all was the bug —
  // nothing told the reader which of twelve calls had been written up.
  openIndex();
  loadSummaries().then((loadedSummaries) => {
    summaries = loadedSummaries;
    written = index.rows.filter(summaryFor);
    if (written.length) openIndex();
  });

  return host;
}

/* ---------- the index ----------------------------------------------------- */

function indexView(a, index, earnings, openCall, written = []) {
  const rows = index.rows;
  const list = el('div', { class: 'trlist' });
  let showAll = rows.length <= DEFAULT_CALLS;

  const more = rows.length > DEFAULT_CALLS
    ? el('button', { type: 'button', class: 'omore omore--plain' })
    : null;

  const draw = () => {
    const n = showAll ? rows.length : DEFAULT_CALLS;
    const hasSummary = (r) => written.some((w) => w.year === r.year && w.quarter === r.quarter);
    list.replaceChildren(...rows.slice(0, n)
      .map((r) => indexRow(a, r, earnings, openCall, hasSummary(r))));
    if (more) more.textContent = showAll ? `Show the latest ${DEFAULT_CALLS}` : `Show all ${rows.length} calls`;
  };
  more?.addEventListener('click', () => { showAll = !showAll; draw(); });
  draw();

  const next = a.quarter?.next || null;

  return el('div', { class: 'ovw' }, [
    next ? card('tr-next', [
      ohead('Next results', null,
        'The date the vendor expects the next report on. Companies confirm these late and move '
        + 'them, so it is an expectation rather than a diary entry.'),
      el('div', { class: 'ostats ostats--split' }, [
        statLine('Expected', fmtDate(next)),
        statLine('Consensus earnings per share', isNum(a.forecast?.rows?.[0]?.eps) || true
          ? nextEpsEstimate(a) : 'n/a', { note: 'for the quarter' }),
      ]),
    ], 'ocard ovw__c12') : null,

    card('tr-index', [
      ohead(`${a.facts.name} earnings calls`, more,
        'Newest first. The figures beside each call are that quarter’s own — how it landed '
        + 'against the consensus that stood before it, and how it compares with the same quarter '
        + 'a year earlier.'),
      written.length ? el('p', { class: 'trnote trnote--lead' }, [
        el('span', { class: 'trrow__badge', text: 'Summary' }),
        el('span', { text: written.length === 1
          ? ` — one call has a written summary. Open ${
            `Q${written[0].quarter} ${written[0].year}`} to read it above the transcript.`
          : ` — ${written.length} calls have a written summary, marked in the list.` }),
      ]) : null,
      list,
      el('p', { class: 't-tiny subtle mt2', text: `${rows.length} call`
        + `${rows.length === 1 ? '' : 's'} on record, back to ${rows.at(-1).year}. Opening one `
        + 'fetches its text; the index itself came with the report.' }),
    ], 'ocard ovw__c12'),
  ].filter(Boolean));
}

/** The consensus EPS for the quarter that has not reported yet. */
function nextEpsEstimate(a) {
  const cur = curSymbol(a.facts.currency);
  const rows = Array.isArray(a.ds.get('earnings')) ? a.ds.get('earnings') : [];
  const pending = rows
    .filter((r) => r && !isNum(r.epsActual) && isNum(r.epsEstimated))
    .sort((x, y) => new Date(x.date) - new Date(y.date))[0];
  return pending ? `${cur}${dec(pending.epsEstimated, 2)}` : 'n/a';
}

function indexRow(a, row, earnings, openCall, hasSummary = false) {
  const m = callMetrics(earnings, row.date);
  const cur = curSymbol(a.facts.currency);

  const metric = (label, v, fmt = (x) => pct(x, { sign: true })) => el('div', { class: 'trrow__metric' }, [
    el('i', { text: label }),
    el('b', { class: isNum(v) ? signClass(v) : 'subtle', text: isNum(v) ? fmt(v) : 'n/a' }),
  ]);

  return el('button', {
    type: 'button', class: 'trrow',
    onclick: () => openCall(row),
  }, [
    el('img', {
      class: 'trrow__logo', src: logoUrl(a.facts.symbol), alt: '', loading: 'lazy',
      onerror: (e) => e.target.remove(),
    }),
    el('div', { class: 'trrow__id' }, [
      el('span', { class: 'trrow__title' }, [
        el('span', { text: `${a.facts.name} — Q${row.quarter} ${row.year}` }),
        hasSummary ? el('span', { class: 'trrow__badge', text: 'Summary' }) : null,
      ].filter(Boolean)),
      el('span', { class: 'trrow__meta', text: `${a.facts.exchange || ''}:${a.facts.symbol} · ${fmtDate(row.date)}` }),
    ]),
    m ? el('div', { class: 'trrow__metrics' }, [
      metric('EPS surprise', m.epsSurprise),
      metric('EPS growth', m.epsGrowth),
      metric('Revenue surprise', m.revenueSurprise),
      metric('Revenue growth', m.revenueGrowth),
    ]) : el('div', { class: 'trrow__metrics' }, [
      el('span', { class: 't-tiny subtle', text: 'No reported quarter matches this call' }),
    ]),
  ]);
}

/* ---------- one call ------------------------------------------------------ */

function backButton(openIndex) {
  return el('button', {
    type: 'button', class: 'omore omore--back', text: 'All earnings calls',
    onclick: openIndex,
  });
}

function loadingView(a, row, openIndex) {
  return el('div', { class: 'ovw' }, [
    card('tr-loading', [
      backButton(openIndex),
      ohead(`Q${row.quarter} ${row.year} — ${fmtDate(row.date)}`),
      el('div', { class: 'sk sk--line' }),
      el('div', { class: 'sk sk--line', style: { width: '86%' } }),
      el('div', { class: 'sk sk--line', style: { width: '92%' } }),
      el('p', { class: 't-xs softer center mt2', text: 'Fetching the transcript…' }),
    ], 'ocard ovw__c12'),
  ]);
}

function callView(a, row, result, summary, index, earnings, written, openIndex, openCall) {
  const status = result?.status || 'skipped';
  const data = result?.data || null;
  const content = data?.content || data?.transcript || '';

  if (status !== 'ok' || !content) {
    return el('div', { class: 'ovw' }, [
      card('tr-missing', [
        backButton(openIndex),
        ohead(`Q${row.quarter} ${row.year} — ${fmtDate(row.date)}`),
        feedGate(a, 'transcriptDates', 'The transcript')
          || notice(status === 'gated'
            ? '<b>Earnings call transcripts</b> are not included in your current FMP plan. The '
              + 'index of calls above comes from a different endpoint, which is why the list '
              + 'loaded and the text did not.'
            : status === 'error'
              ? `The transcript could not be loaded — ${result.message || 'unknown error'}.`
              : 'The feed returned no text for this quarter, though it lists the call.'),
      ], 'ocard ovw__c12'),
    ]);
  }

  const paras = paragraphsOf(content);
  const body = el('div', { class: 'trbody' });
  let showAll = paras.length <= DEFAULT_PARAGRAPHS;

  const more = paras.length > DEFAULT_PARAGRAPHS
    ? el('button', { type: 'button', class: 'omore omore--plain' })
    : null;

  const draw = () => {
    const n = showAll ? paras.length : DEFAULT_PARAGRAPHS;
    body.replaceChildren(...paras.slice(0, n).map((p) => el('p', { class: 'trpara' }, [
      p.speaker ? el('b', { class: 'trpara__who', text: p.speaker }) : null,
      el('span', { text: p.text }),
    ].filter(Boolean))));
    if (more) more.textContent = showAll ? 'Collapse' : `Read the rest — ${paras.length - DEFAULT_PARAGRAPHS} more paragraphs`;
  };
  more?.addEventListener('click', () => { showAll = !showAll; draw(); });
  draw();

  const words = content.split(/\s+/).filter(Boolean).length;
  const others = index.rows.filter((r) => !(r.year === row.year && r.quarter === row.quarter)).slice(0, 6);

  return el('div', { class: 'ovw' }, [
    // Two real columns rather than loose grid items. A transcript is metres
    // long, and left to the grid every other card would land beneath it —
    // which is where the summary was, and why it could not be found.
    el('div', { class: 'trmain ovw__c8' }, [
      el('div', {}, [backButton(openIndex)]),

      summaryCard(summary),

      card('tr-call', [
        ohead(`Q${row.quarter} ${row.year} earnings call`, null,
          'The transcript as the vendor supplies it. Speaker names are taken from the front of '
          + 'each paragraph where the transcriber put one there, and the text is otherwise '
          + 'untouched — no highlighting, nothing this report has decided is the important '
          + 'part.'),
        el('p', { class: 't-xs soft', text: `${a.facts.name} · held ${fmtDate(row.date)} · `
          + `${words.toLocaleString('en-US')} words` }),
        summary ? null : noSummaryNote(row, written, openCall),
        body,
        more,
      ], 'ocard'),
    ].filter(Boolean)),

    el('div', { class: 'trside ovw__c4' }, [
      quarterCard(a, row, earnings),
      seriesCard(a, row, earnings, 'eps'),
      seriesCard(a, row, earnings, 'revenue'),

      others.length ? card('tr-others', [
        ohead('Other calls'),
        el('div', { class: 'trlist trlist--compact' }, others.map((r) => el('button', {
          type: 'button', class: 'trrow trrow--compact', onclick: () => openCall(r),
        }, [
          el('div', { class: 'trrow__id' }, [
            el('span', { class: 'trrow__title', text: `Q${r.quarter} ${r.year}` }),
            el('span', { class: 'trrow__meta', text: fmtDate(r.date) }),
          ]),
        ]))),
      ], 'ocard') : null,
    ].filter(Boolean)),
  ].filter(Boolean));
}

/* ---------- the quarter, as a run rather than a number -------------------- */

/**
 * Earnings per share, or revenue, quarter by quarter — with the call's own
 * quarter picked out.
 *
 * One number is a fact and a run of them is the story the call is about, so
 * the sidebar draws the run and highlights where in it this call sits.
 *
 * The narrow viewBox is the point: `charts.js` scales its drawing to the
 * container, so the shared 760-wide frame in a quarter-width rail renders an
 * axis label at about four pixels. At 340 the same label lands legible.
 */
function seriesCard(a, row, earnings, kind) {
  const cur = curSymbol(a.facts.currency);
  const isEps = kind === 'eps';

  const rows = earnings
    .filter((r) => r && r.date && isNum(isEps ? r.epsActual : r.revenueActual))
    .sort((x, y) => new Date(x.date) - new Date(y.date))
    .slice(-10);

  const title = isEps ? 'Earnings per share' : 'Revenue';
  if (rows.length < 2) {
    return card(`tr-${kind}`, [
      ohead(title),
      notice('Not enough reported quarters to draw a history.'),
    ], 'ocard');
  }

  const open = quarterFor(earnings, row.date);
  const values = rows.map((r) => (isEps ? r.epsActual : r.revenueActual));
  const colors = rows.map((r) => (open && r.date === open.date
    ? 'var(--brand-01)' : (isEps ? 'var(--chart-04)' : 'var(--chart-01)')));

  const label = (r) => {
    const d = new Date(r.date);
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1}’${String(d.getUTCFullYear()).slice(2)}`;
  };

  return card(`tr-${kind}`, [
    ohead(title, null,
      'Reported quarters, oldest on the left, with this call’s own quarter picked out in gold. '
      + 'Labelled by the calendar quarter the results were announced in, because the earnings '
      + 'feed carries no fiscal period.'),
    columnChart(rows.map(label), [{
      name: title,
      color: isEps ? 'var(--chart-04)' : 'var(--chart-01)',
      colors,
      values,
    }], {
      height: 200,
      width: 340,
      legend: false,
      pad: { t: 14, r: 8, b: 28, l: 46 },
      valueFmt: isEps ? (v) => `${cur}${dec(v, 2)}` : (v) => money(v, { currency: cur }),
    }),
  ], 'ocard');
}

/** The quarter the call is about, in figures. */
function quarterCard(a, row, earnings) {
  const m = callMetrics(earnings, row.date);
  const cur = curSymbol(a.facts.currency);
  const fmtMoney = (v) => money(v, { currency: cur });

  if (!m) {
    return card('tr-quarter', [
      ohead('The quarter'),
      notice('No reported quarter in the earnings feed lines up with this call.'),
    ], 'ocard');
  }

  return card('tr-quarter', [
    ohead('The quarter', null,
      'Matched to the call by report date. Surprise is against the consensus that stood before '
      + 'the release; growth is against the same quarter a year earlier, which is the comparison '
      + 'management makes on the call.'),
    el('div', { class: 'ostats' }, [
      statLine('Earnings per share', isNum(m.eps) ? `${cur}${dec(m.eps, 2)}` : 'n/a', { note: 'reported' }),
      statLine('Expected', isNum(m.epsEstimate) ? `${cur}${dec(m.epsEstimate, 2)}` : 'n/a', { note: 'consensus' }),
      statLine('Surprise', isNum(m.epsSurprise) ? pct(m.epsSurprise, { sign: true }) : 'n/a',
        { tone: signClass(m.epsSurprise) }),
      statLine('Growth on the year', isNum(m.epsGrowth) ? pct(m.epsGrowth, { sign: true }) : 'n/a',
        { tone: signClass(m.epsGrowth) }),
    ]),
    el('div', { class: 'ostats ostats--split' }, [
      statLine('Revenue', fmtMoney(m.revenue), { note: 'reported' }),
      statLine('Expected', fmtMoney(m.revenueEstimate), { note: 'consensus' }),
      statLine('Surprise', isNum(m.revenueSurprise) ? pct(m.revenueSurprise, { sign: true }) : 'n/a',
        { tone: signClass(m.revenueSurprise) }),
      statLine('Growth on the year', isNum(m.revenueGrowth) ? pct(m.revenueGrowth, { sign: true }) : 'n/a',
        { tone: signClass(m.revenueGrowth) }),
    ]),
  ], 'ocard');
}
