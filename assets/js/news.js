/* ==========================================================================
   Maz Vantage — the News tab

   Two streams, deliberately not merged: what other people wrote about the
   company, and what the company said about itself. Every other surface in
   this report is a number with a basis under it; this one is the only place
   the reader meets unprocessed text, and the whole design problem is keeping
   the distinction between reporting and self-description visible while doing
   it.

   What this tab does **not** do, and says so on the page:

   * **No sentiment.** FMP supplies none, this app runs no model, and a
     green/red tag on a headline is the single easiest way to make a reader
     believe the page has an opinion it does not have.
   * **No ranking.** Newest first, always. Any other order is an editorial
     judgement about which story matters, and nothing here is qualified to
     make one.
   * **No price attribution.** The price is charted over the same window, once,
     above the stream — never against an individual headline. Putting a day's
     move beside a story asserts the story caused it, which the data cannot
     support and a reader will believe anyway.

   The stream is other people's text. It is rendered through `text:` at every
   point — never `html:` — so a headline is a headline and not markup.
   ========================================================================== */

import { el, isNum, pct, price, ago, fmtDate, num } from './util.js';
import { card, notice, ohead, statLine, feedGate, table } from './ui.js';
import { curSymbol } from './ui.js';
import { lineChart } from './charts.js';
import { loadArticles, articlesReady, articlesForTicker } from './articles.js';
import { relatedResearchCard } from './feed.js';

/** How many stories a panel shows before the reader has to ask for more. */
const PAGE = 12;

export function renderNewsTab(a, nav = {}) {
  const n = a.news;

  if (!n.available) {
    return el('div', { class: 'ovw' }, [
      card('news-none', [
        ohead('News'),
        feedGate(a, 'news', 'Company news')
          || notice('No news was returned for this company.'),
        el('p', { class: 't-tiny subtle mt2', text: 'The bundled snapshot carries only a '
          + 'couple of stories, because a news archive is the one part of this report that is '
          + 'stale the day it is captured. Connect an FMP key in Settings for the live stream.' }),
      ], 'ocard ovw__c12'),
    ]);
  }

  return el('div', {}, [
    el('div', { class: 'ovw' }, [coverageCard(a), publishersCard(a)]),
    streamPanels(a),
    el('div', { class: 'ovw mt3' }, [researchSlot(a, nav), basisCard(a)]),
  ]);
}

/**
 * Vantace research on this company, under the streams.
 *
 * News and research answer different questions — what happened, and what it
 * means for the numbers — and this is the hand-off between them.
 *
 * **It is per company, not per headline.** The obvious version of this feature
 * is a "Read Vantace analysis" button on the individual story it analyses, and
 * that needs an article to record which news item it was written from. Nothing
 * in the store does yet, and matching a headline to an article by ticker and
 * date would attach an article to a story it may have nothing to do with.
 * A company-level link is the claim the data actually supports.
 */
function researchSlot(a, nav) {
  const sym = a.facts?.symbol || a.ds?.symbol;
  const slot = el('div', { class: 'ovw__c12', hidden: true });

  const fill = () => {
    const c = relatedResearchCard(articlesForTicker(sym, 4), nav, {
      title: 'What it means for the numbers',
      cls: 'ocard ovw--tight',
    });
    if (!c) return;
    slot.replaceChildren(c);
    slot.hidden = false;
  };

  if (articlesReady()) fill();
  else loadArticles().then(fill);

  return slot;
}

/* ---------- 1. coverage --------------------------------------------------- */

/**
 * How much is being written, over how long, by how many mastheads — beside
 * the price over exactly that window.
 *
 * The chart is cut to the news window rather than to a round range, so the
 * two halves of the card describe the same stretch of time. A 1-year price
 * chart over a fortnight of headlines would invite the reader to read the
 * year's move as the fortnight's news.
 */
function coverageCard(a) {
  const n = a.news;
  const f = a.facts;

  const { pts, matched } = windowPrices(a);
  const move = pts.length > 1 && pts[0].price > 0
    ? pts.at(-1).price / pts[0].price - 1
    : null;

  const span = isNum(n.spanDays)
    ? (n.spanDays >= 60 ? `${Math.round(n.spanDays / 30)} months` : `${n.spanDays} days`)
    : null;

  return card('news-coverage', [
    ohead('Coverage', n.newest ? el('span', { class: 'pill pill--muted', text: `latest ${ago(n.newest)}` }) : null,
      'Counts of what the vendor returned, not of what was published. FMP carries a subset of '
      + 'the financial press, so this is a sample of coverage and not a census of it.'),

    el('div', { class: 'ostats' }, [
      statLine('Stories returned', String(n.articles.length),
        { note: span ? `over ${span}` : '' }),
      statLine('Mastheads', String(n.publishers.length)),
      statLine('Company releases', String(n.releases.length)),
      statLine('Rate', isNum(n.perDay) ? `${num(n.perDay, 1)} a day` : 'n/a',
        { note: 'across the window' }),
    ]),

    pts.length > 1
      ? el('div', { class: 'mt2' }, [
          el('p', { class: 'osub', text: matched
            ? `Price over the same window${span ? ` — ${span}` : ''}`
            : 'Price — most recent closes on file' }),
          lineChart(pts.map((p) => ({ date: p.date, value: p.price })), {
            height: 180,
            valueFmt: (v) => price(v, curSymbol(f.currency)),
            labelFmt: (d) => fmtDate(d, { day: 'numeric', month: 'short' }),
          }),
          el('p', { class: 't-tiny subtle', text: !isNum(move)
            ? 'Price history is not loaded for this window.'
            : matched
              ? `The shares ${move >= 0 ? 'rose' : 'fell'} ${pct(Math.abs(move))} across the `
                + 'stretch these stories cover. Which of them moved it, if any did, is not '
                + 'something this page can tell you — no headline below is matched to a day’s move.'
              : `The price series ends ${fmtDate(pts.at(-1).date)}, before the newest story below, `
                + 'so this is the last stretch of closes on file rather than the window the '
                + `headlines cover. Across it the shares ${move >= 0 ? 'rose' : 'fell'} `
                + `${pct(Math.abs(move))}.` }),
        ])
      : null,
  ], 'ocard ovw__c8');
}

/**
 * The price series clipped to the span the news stream covers.
 *
 * Two things can go wrong, and both do in practice. A stream that is one busy
 * afternoon would chart three closes and read as a flat line, so the window
 * has a floor of a fortnight. And the price series can end *before* the
 * newest story — which is exactly what the bundled snapshot does, its closes
 * stopping weeks before the report is opened — leaving the clip empty.
 *
 * So the result says whether the two actually line up. `matched` false means
 * the chart is the most recent price history there is rather than the window
 * the headlines cover, and the caption says so instead of quietly implying a
 * correspondence that is not there.
 */
function windowPrices(a) {
  const pts = a.momentum.points || [];
  const n = a.news;
  if (pts.length < 2) return { pts: [], matched: false };

  if (n.oldest) {
    const from = Math.min(new Date(n.oldest).getTime(), Date.now() - 14 * 864e5);
    const clip = pts.filter((p) => new Date(p.date).getTime() >= from);
    if (clip.length > 1) return { pts: clip, matched: true };
  }
  // Fall back to a quarter of closes, however stale they are.
  return { pts: pts.slice(-65), matched: false };
}

/* ---------- 2. publishers ------------------------------------------------- */

function publishersCard(a) {
  const rows = a.news.publishers.slice(0, 12);

  return card('news-publishers', [
    ohead('Who is covering it', null,
      'Story count per masthead in the window above. A count of attention, not of quality or of '
      + 'agreement — two pieces from one outlet outrank one from another here, and that is all '
      + 'it means.'),

    rows.length
      ? el('div', { class: 'nwpubs' }, rows.map((p) => el('div', { class: 'nwpub' }, [
          el('span', { class: 'nwpub__n', title: p.source, text: p.source }),
          el('span', { class: 'nwpub__c', text: String(p.count) }),
        ])))
      : el('p', { class: 'subtle', text: 'No publisher was named on any story.' }),
  ], 'ocard ovw__c4');
}

/* ---------- 3. the two streams -------------------------------------------- */

/**
 * Press and company releases behind a strip.
 *
 * The strip rather than two stacked lists because they answer different
 * questions and a reader is in one mode or the other: "what is being said
 * about this company" and "what has the company announced" are not one
 * scroll.
 */
function streamPanels(a) {
  const n = a.news;

  const PANELS = [
    {
      key: 'press', label: `In the press${n.articles.length ? ` (${n.articles.length})` : ''}`,
      rows: n.articles,
      empty: 'No press coverage was returned.',
      lede: 'Third-party reporting, newest first. Headlines and summaries are the publisher’s '
        + 'own words, reproduced as sent — nothing here is written, edited or scored by this '
        + 'report.',
    },
    {
      key: 'releases', label: `Company releases${n.releases.length ? ` (${n.releases.length})` : ''}`,
      rows: n.releases,
      empty: 'No company releases were returned. This feed is gated on some FMP plans.',
      lede: 'The company’s own announcements, newest first. These are primary sources and they '
        + 'are also marketing: a release says what the company chose to say, in the words it '
        + 'chose, which is exactly why it is kept apart from the coverage beside it.',
    },
  ];

  const panel = el('div', { class: 'ovw', id: 'news-panel', role: 'tabpanel' });
  let current = PANELS[0].key;

  const buttons = PANELS.map((p) => el('button', {
    type: 'button', class: 'subtab', role: 'tab', id: `news-tab-${p.key}`,
    'aria-controls': 'news-panel', text: p.label,
    onclick: () => show(p.key),
  }));

  function show(key) {
    current = key;
    const chosen = PANELS.find((p) => p.key === key) || PANELS[0];
    panel.replaceChildren(streamCard(a, chosen));
    panel.setAttribute('aria-labelledby', `news-tab-${chosen.key}`);
    buttons.forEach((b, i) => {
      const on = PANELS[i].key === key;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }

  const strip = el('div', {
    class: 'subtabs mt3', role: 'tablist', 'aria-label': 'News source',
  }, buttons);

  strip.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = PANELS.findIndex((p) => p.key === current);
    const next = (i + step + PANELS.length) % PANELS.length;
    show(PANELS[next].key);
    buttons[next].focus();
  });

  show(current);
  return el('div', {}, [strip, panel]);
}

/**
 * One stream, paged.
 *
 * Paged rather than scrolled-forever because a hundred stories is a lot of
 * remote thumbnails, and because "show me more" is a cheap way to let the
 * reader say how deep they actually want to go.
 */
function streamCard(a, spec) {
  const list = el('div', { class: 'nwlist' });
  let shown = 0;

  const more = el('button', {
    type: 'button', class: 'btn btn--ghost nwmore',
    onclick: () => { page(); },
  });

  function page() {
    const next = spec.rows.slice(shown, shown + PAGE);
    list.append(...next.map((r) => storyItem(r)));
    shown += next.length;
    const left = spec.rows.length - shown;
    more.textContent = left > 0 ? `Show ${Math.min(left, PAGE)} more — ${left} left` : '';
    more.hidden = left <= 0;
  }

  if (spec.rows.length) page();

  return card(`news-${spec.key}`, [
    ohead(spec.key === 'press' ? 'In the press' : 'Company releases'),
    el('p', { class: 'fgroup__desc', text: spec.lede }),
    spec.rows.length
      ? el('div', {}, [list, more])
      : (feedGate(a, spec.key === 'press' ? 'news' : 'pressReleases',
          spec.key === 'press' ? 'Company news' : 'Company press releases')
         || notice(spec.empty)),
  ], 'ocard ovw__c12');
}

/**
 * One story.
 *
 * The headline is the link and the only link — a card-wide click target would
 * make an accidental navigation off the report out of every stray click, and
 * these all leave the site.
 *
 * Exported because the market-wide News page renders the same row over the
 * same normalised shape; a second copy would drift.
 */
export function storyItem(r) {
  const link = r.url
    ? el('a', {
        class: 'nwitem__t', href: r.url, target: '_blank', rel: 'noopener noreferrer',
        text: r.title,
      })
    : el('span', { class: 'nwitem__t', text: r.title });

  return el('article', { class: 'nwitem' }, [
    thumb(r),
    el('div', { class: 'nwitem__b' }, [
      el('div', { class: 'nwitem__m' }, [
        el('span', { class: `nwsrc ${r.kind === 'release' ? 'is-own' : ''}`.trim(),
          text: r.source || 'Unattributed' }),
        el('span', { class: 'nwitem__d', title: fmtDate(r.date, {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        }), text: ago(r.date) }),
      ]),
      link,
      r.text ? el('p', { class: 'nwitem__x', text: r.text }) : null,
    ]),
  ]);
}

/**
 * The story image, or nothing.
 *
 * `referrerpolicy` is set so opening the report does not tell every publisher
 * in the stream which page the reader was on, and a 404 removes the element
 * rather than leaving a broken-image box in a grid of a dozen.
 */
function thumb(r) {
  if (!r.image) return null;
  const img = el('img', {
    class: 'nwitem__i', src: r.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer',
  });
  img.addEventListener('error', () => img.remove());
  return img;
}

/* ---------- 4. what this is ----------------------------------------------- */

function basisCard(a) {
  const n = a.news;

  return card('news-basis', [
    ohead('What this page is'),

    el('p', { class: 'fgroup__desc', text: 'A vendor feed, printed. Every other tab in this '
      + 'report turns filed figures into a grade with a stated basis; this one carries text '
      + 'written by other people and does nothing to it.' }),

    table([{ label: 'Question' }, { label: 'Answer' }], [
      ['Where the stories come from',
        'Financial Modeling Prep’s stock news and press-release feeds. FMP aggregates a subset '
        + 'of the financial press — absence from this list is not absence from the news.'],
      ['How they are ordered',
        'Newest first, in both streams. Nothing is promoted, and nothing is scored.'],
      ['Whether they are rated',
        'No. There is no sentiment tag, no relevance score and no attempt to say which story '
        + 'matters. This report has no model that could produce one.'],
      ['Whether the price is attributed',
        'No. The chart above spans the same window as the stream and is not matched to any '
        + 'individual story.'],
      ['How current it is',
        n.newest
          ? `Newest story ${ago(n.newest)}, fetched when this report loaded. Feeds are cached `
            + 'for ten minutes.'
          : 'Nothing was returned.'],
    ]),

    notice('Headlines and summaries belong to their publishers and are reproduced from the '
      + 'vendor feed. Follow the link for the full article; the snippet here is the vendor’s '
      + 'summary, not this report’s.'),
  ], 'ocard ovw__c12');
}
