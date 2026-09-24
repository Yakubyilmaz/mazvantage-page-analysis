/* ==========================================================================
   Vanlior — Market News

   One stream, six categories, on the market canvas: a topic strip across the
   top and the stories under it, newest first. What the market did while they
   were written is in the market rail beside every page (`marketrail.js`), so
   this page no longer carries a rail of its own.

   ---------------------------------------------------------------------------
   Where a category comes from, and why that matters
   ---------------------------------------------------------------------------

   FMP publishes **two** news wires — the market-wide firehose and the stock
   wire, which tags every story with the symbol it is filed under — and no
   topic classification at all. So a category here is one of three things, and
   each one says which it is:

   * **A wire, unfiltered.** Latest is both wires merged; Stocks is the stock
     wire. Nothing is chosen, nothing is dropped.
   * **The vendor's own tag.** ETFs keeps the stories filed under a fund this
     product tracks. Indices and Futures keep the stories that *name* one, which
     is a rule about names rather than a tag, and the coverage note says so.
   * **A keyword filter run in this browser.** Economy is the market-wide wire
     kept to headlines about rates, prices, jobs and output. It will miss a
     story that avoids the words and over-catch one that mentions them in
     passing — that is what a filter is, and the page prints the pattern.

   The four topic filters this page used to lead with — earnings, dividends,
   M&A, analyst ratings — are still here and still honest about being filters.
   They are reached by their own links rather than from the strip, which now
   carries the six the market is read by.
   ========================================================================== */

import { el } from './util.js';
import { fetchNewsFeed, hasApiKey } from './fmp.js';
import {
  loadEtfNews, loadIndexNews, loadFuturesNews, normalizeHubQuote, quoteMap,
} from './markethub-data.js';
import { emptyState, storyRow, featuredNews, paintQuotes } from './markethub-ui.js';

/** Stories shown before the reader asks for more. */
const PAGE = 12;
/** The latest few, given the room to be read, above the rest as headlines. */
const FEATURED = 4;

/* ==========================================================================
   The categories
   ========================================================================== */

const ECONOMY = /\b(fed|federal reserve|fomc|rate cut|rate hike|interest rates?|inflation|cpi|ppi|deflation|gdp|recession|unemployment|payrolls?|jobs report|jobless|consumer confidence|retail sales|housing starts|trade deficit|tariffs?|central bank|ecb|boe|boj|treasur\w+|yields?|stimulus|budget|debt ceiling)\b/i;

/**
 * `wires` reads a firehose; `load` reads one of the market boards' own news,
 * which arrives already matched and marked. `any` is a keyword filter and the
 * page never prints one without printing the pattern beside it.
 */
const CATEGORIES = [
  {
    id: 'latest', label: 'Latest', title: 'Latest market news',
    blurb: 'Both of FMP’s wires merged and de-duplicated, newest first. Nothing is filtered, ranked or scored.',
    wires: ['general', 'stock'],
  },
  {
    id: 'stocks', label: 'Stocks', title: 'Stock news',
    blurb: 'The company wire across every ticker FMP covers, unfiltered. Each story is filed by the vendor under the symbol it is about.',
    wires: ['stock'],
  },
  {
    id: 'etfs', label: 'ETFs', title: 'ETF news',
    blurb: 'Stories FMP filed under one of the funds this product tracks, and market-wide stories that name one.',
    load: loadEtfNews,
  },
  {
    id: 'indices', label: 'Indices', title: 'Index news',
    blurb: 'Market-wide stories that name an index this product tracks — whichever country the index belongs to.',
    load: loadIndexNews,
  },
  {
    id: 'futures', label: 'Futures', title: 'Futures news',
    blurb: 'Market-wide stories that name a contract this product tracks. Gold is a contract; Goldman is not.',
    load: loadFuturesNews,
  },
  {
    id: 'economy', label: 'Economy', title: 'Economy news',
    blurb: 'The market-wide wire kept to headlines about rates, prices, jobs and output.',
    wires: ['general'], any: ECONOMY,
  },
  /* The topic filters, reachable by link. They were the strip once; they are
     keyword searches over a wire, and the strip is now the six categories the
     market is actually read by. */
  { id: 'earnings', label: 'Earnings', title: 'Earnings news', hidden: true,
    blurb: 'Headlines mentioning results, guidance or the earnings calendar.',
    wires: ['stock', 'general'],
    any: /\b(earnings|results|quarterly|quarter|EPS|guidance|beats?|misses|missed|profit|revenue|outlook|forecast)\b/i },
  { id: 'dividends', label: 'Dividends', title: 'Dividend news', hidden: true,
    blurb: 'Headlines mentioning dividends, payouts or distributions.',
    wires: ['stock', 'general'],
    any: /\b(dividend|payout|distribution|ex-dividend|yield|buyback|repurchase)\b/i },
  { id: 'ma', label: 'M&A', title: 'Mergers & acquisitions', hidden: true,
    blurb: 'Headlines mentioning deals, takeovers and stakes.',
    wires: ['general', 'stock'],
    any: /\b(acquir\w*|acquisition|merger|merges?|takeover|buyout|bid for|deal|stake|divest\w*|spin[- ]?off|tender offer)\b/i },
  { id: 'ratings', label: 'Analyst ratings', title: 'Analyst ratings', hidden: true,
    blurb: 'Headlines mentioning upgrades, downgrades, initiations and price targets.',
    wires: ['stock', 'general'],
    any: /\b(upgrade[sd]?|downgrade[sd]?|price target|initiat\w+ coverage|reiterat\w*|outperform|underperform|overweight|underweight|buy rating|sell rating|analyst)\b/i },
  // The old name for Stocks, so a link written before this page was rebuilt
  // still lands on the stories it meant.
  { id: 'stock', alias: 'stocks', hidden: true },
];
const categoryOf = (id) => {
  const found = CATEGORIES.find((item) => item.id === id);
  return found?.alias ? CATEGORIES.find((item) => item.id === found.alias) : found || CATEGORIES[0];
};

/* ==========================================================================
   The stories
   ========================================================================== */

/** Both wires carry the same row shape; this is the only shape the page reads. */
function story(raw) {
  const title = String(raw.title || '').trim();
  if (!title) return null;
  return {
    title,
    url: raw.url || null,
    date: raw.publishedDate || raw.date || null,
    source: raw.publisher || raw.site || '',
    text: String(raw.text || raw.content || '').replace(/\s+/g, ' ').trim().slice(0, 320),
    image: raw.image || null,
    // One tagged symbol from the stock wire, or the marks a board matched.
    marks: raw.indices?.length ? raw.indices
      : raw.symbol ? [normalizeHubQuote({}, { symbol: String(raw.symbol).toUpperCase(), kind: 'stock' })] : [],
  };
}

/** Newest first, one row per story: the two wires overlap heavily. */
function merge(lists) {
  const seen = new Set();
  const out = [];
  for (const rows of lists) {
    for (const raw of rows) {
      const item = story(raw);
      if (!item) continue;
      const id = item.url || item.title.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
  }
  return out.filter((item) => item.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** The stories in one category, for this page and for the front page. */
export async function newsStories(id) {
  return stories(categoryOf(id));
}

async function stories(category) {
  if (category.load) {
    const result = await category.load();
    return { stories: merge([result.data?.articles || []]), status: result.status, message: result.message, notes: result.notes || [], scanned: result.data?.scanned || 0 };
  }
  const results = await Promise.all(category.wires.map((wire) => fetchNewsFeed(wire, { limit: 200 })));
  const ok = results.filter((result) => result.status === 'ok');
  const all = merge(ok.map((result) => (Array.isArray(result.data) ? result.data : [])));
  const kept = category.any ? all.filter((item) => category.any.test(`${item.title} ${item.text}`)) : all;
  return {
    stories: kept, scanned: all.length, notes: [],
    status: ok.length ? 'ok' : results[0]?.status || 'error',
    message: ok.length ? '' : results.map((result) => result.message).find(Boolean) || '',
  };
}

/* ==========================================================================
   The page
   ========================================================================== */

export function renderNewsroomPage(sub, nav = {}) {
  const category = categoryOf(sub || 'latest');
  let disposed = false;

  const page = el('main', { class: 'mh-page nw-page', id: 'market-news' });
  const strip = el('nav', { class: 'mh-navigation', 'aria-label': 'News categories' },
    CATEGORIES.filter((item) => !item.hidden).map((item) => el('button', {
      type: 'button', 'data-topic': item.id, class: item.id === category.id ? 'is-active' : '',
      'aria-current': item.id === category.id ? 'page' : null, text: item.label,
      onclick: () => nav.goView?.('news', item.id),
    })));
  const stream = el('div', { class: 'nw-stream' }, [emptyState('loading', '', true)]);

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'MARKET NEWS' }),
      el('h1', { class: 'nw-title', text: category.title }),
      el('div', { class: 'mh-hero__meta' }, [
        el('span', { text: category.blurb }),
      ]),
    ]),
    strip,
    el('div', { class: 'nw-layout' }, [stream]),
  );

  /* ---- the stream -------------------------------------------------------- */

  function draw(result) {
    const rows = result.stories;
    if (!rows.length) {
      stream.replaceChildren(emptyState(result.status, result.message
        || (category.any ? 'Nothing in the fetched window matched this category. The wire goes back only as far as the vendor returns in one page, so a quiet stretch really can be empty.'
          : 'The wire returned nothing for this category.')), coverage(result));
      return;
    }
    /* The latest four lead the category — one with the room to be read and
       three headlines beside it — and the rest of the wire runs under them as
       the same rows every other page prints. */
    const lead = rows.slice(0, FEATURED);
    const tail = rows.slice(lead.length);
    const featured = el('div', { class: 'nw-featured' }, [featuredNews(lead, { nav, below: 0, aside: FEATURED - 1 })]);
    const list = el('div', { class: 'nw-list' });
    let shown = 0;
    const more = el('button', { type: 'button', class: 'nw-more', onclick: () => next() });
    function next() {
      const batch = tail.slice(shown, shown + PAGE);
      list.append(...batch.map((item) => storyRow(item, { nav })));
      shown += batch.length;
      const left = tail.length - shown;
      more.textContent = left > 0 ? `Show ${Math.min(left, PAGE)} more — ${left} left` : '';
      more.hidden = left <= 0;
      // The rows carry their symbols' quotes too, and a page of rows is one
      // batch call: `quotesFor` asks for fifty symbols at a time, so showing
      // more stories costs a request, not a request per story.
      quoteMap(batch.flatMap((item) => (item.marks || []).map((mark) => mark.symbol)))
        .then((quotes) => { if (!disposed && list.isConnected) paintQuotes(list, quotes); })
        .catch(() => { /* the ticks simply carry no change */ });
    }
    next();
    stream.replaceChildren(
      el('p', { class: 'nw-count', text: `${rows.length.toLocaleString()} ${rows.length === 1 ? 'story' : 'stories'}${result.scanned && (category.any || category.load) ? ` matched from the ${result.scanned.toLocaleString()} latest` : ''}` }),
      featured, list, more, coverage(result),
    );
    // The chips carry what the tagged symbol did, which is one batch quote for
    // the four stories on screen. The block is drawn before it lands.
    quoteMap(lead.flatMap((item) => (item.marks || []).map((mark) => mark.symbol))).then((quotes) => {
      if (disposed || !featured.isConnected || !quotes.size) return;
      featured.replaceChildren(featuredNews(lead, { nav, below: 0, aside: FEATURED - 1, quotes }));
    }).catch(() => { /* the chips simply carry no change */ });
  }

  /** What the category owes its reader, in the canvas's own coverage block. */
  function coverage(result) {
    const lines = [...(result.notes || [])];
    if (category.wires) lines.push(`Read from FMP’s ${category.wires.join(' and ')} ${category.wires.length > 1 ? 'wires' : 'wire'}, merged and de-duplicated by URL. Headlines and summaries are the publisher’s own words and open on the publisher’s site.`);
    if (category.any) lines.push(`FMP publishes no topic classification, so this category is a keyword filter run in your browser over that wire: ${String(category.any)}. It reads the headline and the vendor’s one-line summary, never the article body, so it misses a story that avoids these words and catches one that mentions them in passing.`);
    lines.push('Nothing here is ranked, scored or sentiment-tagged, and no story is promoted.');
    return el('details', { class: 'mh-coverage' }, [
      el('summary', { text: 'Where these stories come from' }),
      el('div', {}, lines.map((line) => el('p', { text: line }))),
    ]);
  }

  /* ---- load -------------------------------------------------------------- */

  if (!hasApiKey()) {
    stream.replaceChildren(emptyState('skipped',
      'Market News is market-wide data and needs a live FMP connection. Add your API key in Settings to load the wire.'));
  } else {
    stories(category)
      .then((result) => { if (!disposed) draw(result); })
      .catch((error) => { if (!disposed) stream.replaceChildren(emptyState('error', String(error?.message || error))); });
  }

  page.dispose = () => { disposed = true; };
  return page;
}
