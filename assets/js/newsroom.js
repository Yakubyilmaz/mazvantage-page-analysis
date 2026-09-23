/* ==========================================================================
   Maz Vantage — Market News

   One stream, six categories, on the market canvas: a topic strip across the
   top, the stories down the middle newest first, and a rail beside them
   carrying what the market did while they were written.

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
import { fetchNewsFeed, fetchMarket, fetchCalendar, hasApiKey } from './fmp.js';
import {
  loadEtfNews, loadIndexNews, loadFuturesNews, loadHubSection, countryOf,
  normalizeHubQuote, isUSListing, quoteMap,
} from './markethub-data.js';
import {
  storedCountry, emptyState, instrumentMark, arrow, storyRow, quoteBlock, featuredNews, paintQuotes,
} from './markethub-ui.js';

/** Stories shown before the reader asks for more. */
const PAGE = 12;
/** The latest few, given the room to be read, above the rest as headlines. */
const FEATURED = 4;
/** What the rail ranks. Five is what fits beside a screen of stories. */
const RAIL = 5;
/** How far ahead the calendar block looks. */
const CALENDAR_DAYS = 7;
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

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
  const country = countryOf(storedCountry() === 'WORLD' ? 'US' : storedCountry());
  let disposed = false;

  const page = el('main', { class: 'mh-page nw-page', id: 'market-news' });
  const strip = el('nav', { class: 'mh-navigation', 'aria-label': 'News categories' },
    CATEGORIES.filter((item) => !item.hidden).map((item) => el('button', {
      type: 'button', 'data-topic': item.id, class: item.id === category.id ? 'is-active' : '',
      'aria-current': item.id === category.id ? 'page' : null, text: item.label,
      onclick: () => nav.goView?.('news', item.id),
    })));
  const stream = el('div', { class: 'nw-stream' }, [emptyState('loading', '', true)]);
  const rail = el('aside', { class: 'nw-rail', 'aria-label': 'Market snapshot' });

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'MARKET NEWS' }),
      el('h1', { class: 'nw-title', text: category.title }),
      el('div', { class: 'mh-hero__meta' }, [
        el('span', { text: category.blurb }),
      ]),
    ]),
    strip,
    el('div', { class: 'nw-layout' }, [stream, rail]),
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

  /* ---- the rail ---------------------------------------------------------- */

  const movers = (result) => (Array.isArray(result.data) ? result.data : [])
    .map((row) => normalizeHubQuote(row, { kind: 'stock' }))
    .filter((row) => row.available).slice(0, RAIL);

  /* ---- the calendar block -------------------------------------------------
     Two feeds behind one heading, because a reader watching the week wants
     both and the rail has room for one block. The dividends feed is fetched
     the first time that tab is opened: a request for a list nobody looked at
     is a request this page should not make. */
  function calendarBlock(loaded) {
    const rows = el('div', { class: 'nw-rail__rows' });
    const cache = { earnings: loaded, dividends: null };
    let kind = 'earnings';
    const tabs = el('div', { class: 'nw-cal__tabs', role: 'group', 'aria-label': 'Calendar' },
      [['earnings', 'Earnings'], ['dividends', 'Dividends']].map(([id, label]) => el('button', {
        type: 'button', 'data-cal': id, class: id === kind ? 'is-active' : '',
        'aria-pressed': String(id === kind), text: label, onclick: () => pick(id),
      })));

    const line = (row) => {
      const when = String(row.date || '').slice(0, 10);
      const figure = kind === 'earnings'
        ? (Number.isFinite(Number(row.epsEstimated)) ? `${Number(row.epsEstimated).toFixed(2)} est` : '—')
        : (Number.isFinite(Number(row.dividend)) ? `$${Number(row.dividend).toFixed(2)}` : '—');
      return el('button', {
        type: 'button', class: 'nw-rail__row', onclick: () => nav.goSymbol?.(row.symbol),
        'aria-label': `${row.symbol}, ${kind === 'earnings' ? 'reports' : 'goes ex-dividend'} ${when}`,
      }, [
        el('span', { class: 'nw-rail__id' }, [instrumentMark({ symbol: row.symbol, kind: 'stock' }),
          el('span', { text: row.symbol })]),
        el('span', { class: 'nw-rail__v' }, [
          el('span', { class: 'nw-cal__d', text: new Date(`${when}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) }),
          el('span', { class: 'nw-cal__f', text: figure }),
        ]),
      ]);
    };
    /* One line per company, the nearest date first. The calendar feed carries
       the same company on three exchanges; the rail has five rows and none of
       them should be the Swiss line of a US report. */
    const listed = (result) => {
      const seen = new Set();
      return (Array.isArray(result?.data) ? result.data : [])
        .filter((row) => row.symbol && isUSListing(row) && row.date)
        .filter((row) => !seen.has(row.symbol) && seen.add(row.symbol))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(0, RAIL);
    };
    function paint(result) {
      const list = listed(result);
      rows.replaceChildren(...(list.length ? list.map(line)
        : [emptyState(result?.status || 'ok', `No ${kind === 'earnings' ? 'reports' : 'ex-dividend dates'} in the next ${CALENDAR_DAYS} days.`, true)]));
    }
    async function pick(id) {
      kind = id;
      for (const button of tabs.querySelectorAll('[data-cal]')) {
        const active = button.dataset.cal === kind;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      if (!cache[kind]) {
        rows.replaceChildren(emptyState('loading', '', true));
        cache[kind] = await fetchCalendar(kind, day(0), day(CALENDAR_DAYS));
        if (disposed || !rows.isConnected) return;
      }
      paint(cache[kind]);
    }
    paint(cache.earnings);
    return el('section', { class: 'nw-rail__block nw-cal' }, [
      el('h2', { class: 'nw-rail__h' }, [el('button', {
        type: 'button', onclick: () => nav.goView?.('calendar'),
      }, ['Stocks calendar', arrow()])]),
      tabs, rows,
      el('p', { class: 'nw-cal__note', text: `US listings reporting or going ex-dividend in the next ${CALENDAR_DAYS} days, one line per company.` }),
    ]);
  }

  async function drawRail() {
    if (!hasApiKey()) {
      rail.replaceChildren(el('section', { class: 'nw-rail__block' }, [
        el('h2', { class: 'nw-rail__h', text: 'Market snapshot' }),
        emptyState('skipped', 'Connect your FMP API key in Settings to load quotes beside the stream.', true),
      ]));
      return;
    }
    rail.replaceChildren(el('div', { class: 'nw-rail__block' }, [emptyState('loading', '', true)]));
    const [indices, gainers, losers, active, earnings] = await Promise.all([
      loadHubSection('indices', { country: country.code }),
      fetchMarket('gainers'), fetchMarket('losers'), fetchMarket('active'),
      fetchCalendar('earnings', day(0), day(CALENDAR_DAYS)),
    ]);
    if (disposed || !rail.isConnected) return;
    const quotes = (indices.data?.quotes || []).filter((row) => row.available).slice(0, RAIL);
    const open = (row) => nav.goSymbol?.(row.symbol);
    rail.replaceChildren(
      quoteBlock(`${country.short} market summary`, quotes,
        { seeAll: () => nav.goView?.('markets', 'indices', { country: country.code }) }),
      quoteBlock('Gainers', movers(gainers), { onPick: open, seeAll: () => nav.goView?.('markets', 'gainers') }),
      quoteBlock('Losers', movers(losers), { onPick: open, seeAll: () => nav.goView?.('markets', 'losers') }),
      quoteBlock('Most active', movers(active), { onPick: open, seeAll: () => nav.goView?.('markets', 'active') }),
      calendarBlock(earnings),
      el('p', { class: 'nw-rail__note', text: 'Quotes and calendars from FMP, and they may be delayed. The rail is what the market did, not what the stories say about it.' }),
      el('button', { type: 'button', class: 'mh-see-all', onclick: () => nav.goView?.('markets', 'overview') }, ['Open Market Data', arrow()]),
    );
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
  drawRail();

  page.dispose = () => { disposed = true; };
  return page;
}
