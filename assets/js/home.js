/* ==========================================================================
   Maz Vantage — Home

   The market's front page. A banner of what the indices and the busiest
   listings are doing, the wire down the middle with what is popular beside
   it, and then a section per part of the market: the world, US stocks, funds,
   commodities, the economy.

   ---------------------------------------------------------------------------
   What this page is, and what it costs
   ---------------------------------------------------------------------------

   Every section here is a section that already exists somewhere in the
   product, loaded through the same adapter and rendered with the same rows,
   so the front page cannot drift away from the pages it summarises. Nothing
   is computed here and nothing is ranked here.

   It is a **market** page, which means it needs a live FMP connection — the
   bundled snapshot is one company, and one company is not a market. Without a
   key the page says so once, at the top, rather than printing the same box
   nine times.

   Sections below the fold load **when they are reached**, the way the Market
   Data hub loads its own: arriving on the page pays for the banner, the wire
   and the rail, and scrolling pays for the rest.
   ========================================================================== */

import { el, isNum } from './util.js';
import { fetchMarket, hasApiKey } from './fmp.js';
import {
  HUB_SECTIONS, DEFAULT_COUNTRY, countryOf, loadHubSection, normalizeHubQuote, quoteMap,
} from './markethub-data.js';
import {
  emptyState, heading, instrumentMark, priceText, signed, changeOf,
  arrow, quoteRow, storyRow, featuredNews, paintQuotes,
} from './markethub-ui.js';
import { marketChart } from './markethub-chart.js';
import { newsStories } from './newsroom.js';
import { economyMaps } from './economy-maps.js';
import { calendarStrip, economicReleaseCards } from './markethub-widgets.js';
import { indicatorValue, periodOf } from './economy-us.js';
import { COLLECTIONS } from './stockmarkets.js';
import { IDEAS, IDEA_BY_KEY } from './ideas.js';
import { snowflake, AXES } from './snowflake.js';
import { gradePill } from './gradeview.js';
import { letterFor } from './grading.js';

/** Rows in a ranking column. */
const RANK = 5;
/** The front page's own block: one lead, three cards under it, four beside. */
const TOP_STORIES = 8;
/** Stories under the block, and in a section's own strip. */
const MORE_STORIES = 6;
const SECTION_STORIES = 3;
/** Cards in a calendar strip before the reader is sent to the full calendar. */
const CALENDAR_EVENTS = 12;
/** Benchmarks listed beside the chart: one charted, the rest a click away. */
const MAJOR_INDICES = 7;
/** The same board over a section's own instruments. */
const MAJOR_QUOTES = 8;
/** The badges the Market Data hub puts beside these headings. */
const SECTION_MARKS = { etfs: '▦', futures: '◈' };
/** The ideas the front page leads with, in the order the stock board shows them. */
const HOME_IDEAS = ['us-tech-top15', 'us-value-top20', 'dividend-compounders', 'compounding-growth'];
/* ---- the quant showcase -------------------------------------------------
   Six companies with their five factor scores, as the rating engine hands
   them over. This is a **fixture**, not a computation: the engine is ours and
   its output is not something the front page can derive from FMP, so the
   block ships with a sample set to show the card, the flake and the grade
   working, and says so underneath rather than letting a plausible-looking
   score imply a ranking that did not run. Replacing it with the engine is one
   edit -- keep the shape and drop the notice.

   Each row's overall grade is the mean of its five, which is what the report
   does, and the means here match the ratings the sample article store already
   carries for the same tickers. */
const SAMPLE_QUANT = [
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'Technology',
    scores: { valuation: 2.75, growth: 5.0, profitability: 4.9, momentum: 4.8, health: 4.6 } },
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'Communication Services',
    scores: { valuation: 3.6, growth: 3.9, profitability: 4.5, momentum: 3.6, health: 4.25 } },
  { symbol: 'TSM', name: 'Taiwan Semiconductor', sector: 'Technology',
    scores: { valuation: 3.8, growth: 4.1, profitability: 4.3, momentum: 3.6, health: 3.75 } },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Communication Services',
    scores: { valuation: 3.7, growth: 4.0, profitability: 4.6, momentum: 3.3, health: 3.8 } },
  { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology',
    scores: { valuation: 2.9, growth: 4.6, profitability: 3.5, momentum: 4.3, health: 3.8 } },
  { symbol: 'QCOM', name: 'Qualcomm', sector: 'Technology',
    scores: { valuation: 4.3, growth: 3.2, profitability: 4.2, momentum: 3.1, health: 3.9 } },
];
const QUANT_NOTICE = 'These six are <b>sample engine output</b>, shipped so the card, the factor '
  + 'flake and the grade can be seen working. The tickers are real and the scores are realistic, '
  + 'but <b>nothing here was computed on this page</b> — open a company to see grades that were.';
/** The indicator series the economy strip leads with. */
const HEADLINE_SERIES = ['realGDP', 'inflationRate', 'unemploymentRate', 'federalFunds'];

const tabsOf = (id) => HUB_SECTIONS.find((section) => section.id === id)?.tabs || [];
const tabOf = (id, tab) => tabsOf(id).find((item) => item.id === tab) || {};

export function renderHomePage(sub, nav = {}) {
  /* **The front page is the world, and it stays there.**

     It used to read the Market Data picker's country, which meant that looking
     up Turkey once left the front page reporting Turkey — its stocks, its
     funds, its calendar — until the reader went back and changed it. A picker
     is the state of the page it sits on; a front page is where somebody lands
     without having chosen anything.

     So the country here is fixed, and it is the United States for the same
     reason the hub's own World view fixes it there: the world's equities,
     funds and economic series are quoted, listed and published in the US, and
     the indices below are the world's benchmarks rather than one market's. The
     links out carry no country either, so Market Data keeps whatever the
     reader last chose *there*. */
  const country = countryOf(DEFAULT_COUNTRY);
  const page = el('main', { class: 'mh-page hm-page', id: 'home' });
  const resources = new Set();
  let disposed = false;
  const track = (node) => { resources.add(node); return node; };
  const openSymbol = (row) => nav.goSymbol?.(row.symbol);

  /* The badge the Market Data hub puts beside the same heading. The equity one
     carries the country -- the stripes for the United States, the country's
     own code anywhere else -- so the US flag never ends up sitting next to
     another country's name. */
  const sectionMark = (kind) => {
    if (kind !== 'stocks') {
      return el('span', { class: `mh-section-mark mh-section-mark--${kind}`,
        'aria-hidden': 'true', text: SECTION_MARKS[kind] });
    }
    const local = country.code !== 'US';
    return el('span', {
      class: `mh-section-mark mh-section-mark--${local ? 'local' : 'stocks'}`,
      'aria-hidden': 'true', text: local ? country.code : 'US',
    });
  };

  /* ---- the banner --------------------------------------------------------
     What a market page opens with: the levels, then the listings moving most.
     One strip, scrolled rather than wrapped, because it is a glance and not a
     table. */
  const banner = el('div', { class: 'hm-banner', role: 'region', 'aria-label': 'Market snapshot' });

  function tile(row) {
    const change = changeOf(row);
    return el('button', {
      type: 'button', class: `hm-tile${isNum(change) && change < 0 ? ' is-down' : isNum(change) ? ' is-up' : ''}`,
      onclick: () => (row.kind === 'index' ? nav.goView?.('markets', 'indices') : openSymbol(row)),
    }, [
      el('span', { class: 'hm-tile__n', text: row.shortName || row.symbol }),
      el('span', { class: 'hm-tile__v' }, [priceText(row), signed(change)]),
    ]);
  }

  /* ---- the lead ---------------------------------------------------------- */
  const top = el('div', { class: 'hm-top__body' }, [emptyState('loading', '', true)]);
  const stream = el('div', { class: 'nw-stream' }, [emptyState('loading', '', true)]);
  const sections = el('div', { class: 'hm-sections' });

  /* ---- the section strip -------------------------------------------------
     Five sections, each the size of a page, is a long scroll to reach the one
     the reader came for. The same sticky strip the Market Data hub carries,
     with the same behaviour: a click jumps to a section and pays for it on
     the way, and whichever section is under the strip holds the mark. */
  const navigation = el('nav', { class: 'mh-navigation hm-navigation', 'aria-label': 'Home sections' });

  function markCurrent(id) {
    for (const button of navigation.querySelectorAll('[data-section]')) {
      const active = button.dataset.section === id;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    }
  }

  function jump(id) {
    const node = sections.querySelector(`#home-${id}`);
    if (!node) return;
    // A jump lands on a section that has not been reached yet, so it pays for
    // itself here rather than waiting for the observer to catch up.
    node.load?.();
    markCurrent(id);
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  page.append(
    el('header', { class: 'mh-hero hm-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'MAZ VANTAGE' }),
      el('h1', { class: 'hm-title', text: 'Today’s market' }),
      el('div', { class: 'mh-hero__meta' }, [
        el('span', { text: 'Quotes, rankings and the wire, from Financial Modeling Prep. Every section below is the page it summarises, loaded as you reach it.' }),
      ]),
    ]),
    navigation,
    banner,
    el('section', { class: 'hm-top', 'aria-label': 'Top stories' }, [
      el('div', { class: 'hm-top__head' }, [heading('Top stories', () => nav.goView?.('news', 'latest'), 'h2')]),
      top,
    ]),
    /* No rail of its own any more: Trending, Top gainers and Top losers are
       the market rail's Most active, Gainers and Losers, and that rail is on
       this page too. The wire takes the width the duplicate was using. */
    el('div', { class: 'nw-layout nw-layout--solo hm-lead' }, [stream]),
    sections,
  );

  /* ---- a section ---------------------------------------------------------
     Built empty, filled when the reader reaches it. `load` is called once.

     `mark` is the badge the Market Data hub puts beside the same heading --
     the flag for an equity market, nothing for the rest. It sits outside the
     see-all button, as it does there: it names the section, it is not a link.
     `navLabel` is the short form the sticky strip above carries. */
  function section(id, title, blurb, seeAll, build, { mark = null, navLabel = title } = {}) {
    const body = el('div', { class: 'hm-section__body' }, [emptyState('loading', '', true)]);
    const title2 = el('h2', { class: 'mh-heading mh-heading--section' }, [
      mark,
      seeAll ? el('button', { type: 'button', 'aria-label': `${title} — open the board`, onclick: seeAll },
        [title, arrow()]) : title,
    ].filter(Boolean));
    const node = el('section', { class: 'hm-section', id: `home-${id}`, 'aria-label': title }, [
      el('div', { class: 'hm-section__head' }, [
        title2,
        blurb ? el('p', { class: 'mh-section-description', text: blurb }) : null,
      ].filter(Boolean)),
      body,
    ]);
    node.sectionId = id;
    node.navLabel = navLabel;
    let loaded = false;
    node.load = async () => {
      if (disposed || loaded) return;
      loaded = true;
      node.setAttribute('aria-busy', 'true');
      try {
        const nodes = await build();
        if (disposed || !node.isConnected) return;
        body.replaceChildren(...[].concat(nodes).filter(Boolean));
      } catch (error) {
        if (!disposed) body.replaceChildren(emptyState('error', String(error?.message || error), true));
      } finally {
        node.removeAttribute('aria-busy');
      }
    };
    return node;
  }

  /** A card's overall grade: the mean of the five factors it draws, which is
   *  how the report composes one. Never stored beside the scores, so a fixture
   *  cannot disagree with its own flake. */
  const overallOf = (row) => {
    const values = AXES.map((axis) => row.scores?.[axis.key]).filter(isNum);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };

  /** The rows of a section's catalog the quote feed actually filled, capped to
   *  a board. A catalog row FMP did not price is an identity with no values,
   *  which is a line the board cannot chart and a reader cannot use. */
  const quoted = (rows) => (rows || []).filter((row) => row.available).slice(0, MAJOR_QUOTES);

  /* ---- the summary board -------------------------------------------------
     One instrument charted, its peers listed beside it, and the list is the
     chart's own control: picking a row charts it. The chart is the same one
     the asset pages use, so its ranges, its crosshair and its expanded view
     come with it.

     Indices and equities are the same board with a different list, so the
     label and the way out are the caller's to name. */
  function summaryBoard(rows, { label, seeAll, onAll } = {}) {
    // Chart something that has a price: a catalog row the quote feed missed
    // would open the board on an empty plot.
    const lead = rows.find((row) => isNum(row.price)) || rows[0];
    const chart = track(marketChart({ ...lead, quote: lead }));
    const buttons = [];
    const choose = (row) => {
      for (const button of buttons) {
        const on = button.dataset.symbol === row.symbol;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', String(on));
      }
      chart.setSymbol({ ...row, quote: row });
    };
    for (const row of rows) {
      const ticker = String(row.symbol || '').replace(/^\^/, '');
      const name = row.shortName || row.name || row.symbol;
      const button = el('button', {
        type: 'button', class: `hm-major__row${row.symbol === lead.symbol ? ' is-active' : ''}`,
        'data-symbol': row.symbol, 'aria-pressed': String(row.symbol === lead.symbol),
        'aria-label': `Chart ${name}`, onclick: () => choose(row),
      }, [
        el('span', { class: 'hm-major__id' }, [instrumentMark(row), el('span', { class: 'hm-major__name' }, [
          el('strong', { text: name }),
          ticker ? el('small', { text: ticker }) : null,
        ].filter(Boolean))]),
        el('span', { class: 'hm-major__v' }, [priceText(row), signed(changeOf(row))]),
      ]);
      buttons.push(button);
    }
    return el('div', { class: 'hm-summary' }, [
      el('div', { class: 'hm-summary__chart' }, [chart]),
      el('section', { class: 'hm-major', 'aria-label': label }, [
        el('h3', { class: 'hm-major__h', text: label }),
        el('div', { class: 'hm-major__rows' }, buttons),
        el('button', { type: 'button', class: 'mh-see-all', onclick: () => onAll?.() }, [seeAll, arrow()]),
      ]),
    ]);
  }

  /** One ranking column, the same row the hub ranks with. */
  function rankingList(title, rows, spec, seeAll, status) {
    return el('section', { class: 'mh-ranking', 'aria-label': title }, [
      heading(title, rows.length && seeAll ? seeAll : null),
      rows.length ? el('div', { class: 'mh-rows' }, rows.slice(0, RANK).map((row) => quoteRow(row, spec, openSymbol)))
        : emptyState(status?.status || 'unavailable', status?.message || '', true),
    ]);
  }

  /** What a section has coming: the hub's own calendar rows, on the hub's own
   *  strip, capped to a glance and linked to the calendar that holds them all. */
  function calendarBlock(title, rows, kind, seeAll, status, fallback) {
    return el('section', { class: 'mh-calendar-block' }, [
      heading(title, rows.length ? seeAll : null),
      rows.length ? calendarStrip(rows.slice(0, CALENDAR_EVENTS), {
        kind, onSymbol: (symbol) => nav.goSymbol?.(symbol), onAll: seeAll,
      }) : emptyState(status?.status || 'unavailable', status?.message || fallback, true),
    ]);
  }

  /* ---- the stock board's own blocks ---------------------------------------
     Collections and ideas are the two ways into a screen, and both already
     exist on the Stocks board. The cards are that board's cards, on that
     board's grids, so the front page cannot drift away from what they open. */

  function collectionsBlock() {
    const openScreen = (collection) =>
      nav.goView?.('stocks', 'screener', { collection });
    return el('section', { class: 'hm-block', 'aria-label': 'Stock collections' }, [
      heading('Stock collections', () => openScreen('all')),
      el('div', { class: 'ms-collections' }, COLLECTIONS.map((item, i) => el('button', {
        type: 'button', class: 'ms-collection', text: item.title,
        style: { '--collection-hue': String((i * 37 + 205) % 360) },
        onclick: () => openScreen(item.id),
      }))),
    ]);
  }

  function ideasBlock() {
    const picks = HOME_IDEAS.map((key) => IDEA_BY_KEY[key] || IDEAS.find((i) => i.key === key)).filter(Boolean);
    return el('section', { class: 'hm-block', 'aria-label': 'Stock ideas' }, [
      heading('Stock ideas', () => nav.goView?.('ideas', 'all')),
      picks.length ? el('div', { class: 'ms-idea-grid' }, picks.map((idea) => el('button', {
        type: 'button', class: 'ms-idea-card',
        onclick: () => nav.goView?.('ideas', null, { idea: idea.key }),
      }, [
        el('small', { text: idea.group }),
        el('h3', { text: idea.title }),
        el('p', { text: idea.thesis }),
        el('span', { text: 'Explore portfolio ›' }),
      ]))) : emptyState('unavailable', 'No investment ideas are defined.', true),
    ]);
  }

  /* ---- top quant stocks ---------------------------------------------------
     Our own rating, six companies at a time: the company, its five factor
     scores on the report's own flake, and the grade those five average to.
     The rows come from SAMPLE_QUANT -- see the note there for why they are a
     fixture and what replacing them takes. */
  function quantBlock() {
    const card = (row) => el('button', {
      type: 'button', class: 'hm-quant__card',
      'aria-label': `${row.name} (${row.symbol}) — open the report`,
      onclick: () => nav.goSymbol?.(row.symbol),
    }, [
      el('span', { class: 'hm-quant__id' }, [
        instrumentMark({ ...row, kind: 'stock' }),
        el('span', { class: 'hm-quant__name' }, [
          el('strong', { text: row.name }),
          el('small', { text: row.sector }),
        ]),
      ]),
      el('span', { class: 'hm-quant__flake' }, [
        snowflake(row.scores, { size: 168, labels: false, interactive: false }),
      ]),
      el('span', { class: 'hm-quant__score' }, [
        gradePill(overallOf(row), letterFor(overallOf(row))),
        el('small', { text: `${AXES.length} factors` }),
      ]),
    ]);

    return el('section', { class: 'hm-block hm-quant', 'aria-label': 'Top quant stocks' }, [
      heading('Top quant stocks', () => nav.goView?.('quant', 'top')),
      el('div', { class: 'hm-quant__grid' }, SAMPLE_QUANT.map(card)),
      el('p', { class: 'mh-section-description', html: QUANT_NOTICE }),
    ]);
  }

  /** The three newest stories of a category, under whatever they belong to. */
  async function storyStrip(category, label) {
    const result = await newsStories(category);
    const rows = result.stories.slice(0, SECTION_STORIES);
    const list = rows.length
      ? el('div', { class: 'nw-list hm-strip__list' }, rows.map((item) => storyRow(item, { nav })))
      : emptyState(result.status, result.message || 'The wire returned nothing for this part of the market.', true);
    // Three stories' symbols is one batch quote, asked for after the strip is
    // built so the section never waits on it to render.
    if (rows.length) {
      quoteMap(rows.flatMap((item) => (item.marks || []).map((mark) => mark.symbol)))
        .then((quotes) => { if (!disposed && list.isConnected) paintQuotes(list, quotes); })
        .catch(() => { /* the ticks simply carry no change */ });
    }
    return el('div', { class: 'hm-strip' }, [
      heading(label, () => nav.goView?.('news', category)),
      list,
    ]);
  }

  /* ---- the sections themselves ------------------------------------------- */

  const markets = section('markets', 'Markets summary',
    'Every index FMP quotes, and the United States series behind them.',
    () => nav.goView?.('markets', 'overview'),
    async () => {
      const [indices, economy, stories] = await Promise.all([
        loadHubSection('indices', { country: country.code }),
        loadHubSection('economy', { country: country.code }),
        storyStrip('indices', 'Index news'),
      ]);
      /* One benchmark per country, which is what the hub's World view shows:
         the US primary first and the rest of the world after it, rather than
         six US indices and then everywhere else. */
      const seen = new Set();
      const world = [...(indices.data?.quotes || []).filter((row) => row.meta?.primary || row.primary),
        ...(indices.data?.worldIndices || [])]
        .filter((row) => row.available && !seen.has(row.symbol) && seen.add(row.symbol));
      const series = HEADLINE_SERIES.map((name) => economy.data?.usIndicators?.get(name)).filter(Boolean);
      return [
        world.length ? summaryBoard(world.slice(0, MAJOR_INDICES), {
          label: 'Major indices', seeAll: 'See all major indices',
          onAll: () => nav.goView?.('markets', 'indices'),
        }) : emptyState(indices.status, indices.message || 'FMP returned no index quotes for this market.', true),
        el('section', { class: 'hm-econ' }, [
          heading('The US economy', () => nav.goView?.('markets', 'economy')),
          series.length ? el('div', { class: 'hm-econ__rows' }, series.map((entry) => el('div', { class: 'hm-econ__row' }, [
            el('span', { class: 'hm-econ__k', text: entry.label }),
            el('strong', { class: 'hm-econ__v', text: indicatorValue(entry.latest?.value, entry.unit) }),
            el('span', { class: 'hm-econ__d', text: entry.latest ? periodOf(entry.latest.date, entry.step) : '—' }),
          ]))) : emptyState(economy.status, 'FMP returned no observation for the headline US series.', true),
        ]),
        stories,
      ];
    });

  const stocks = section('stocks', `${country.short} stocks`,
    'The session’s movers, the busiest books and the widest ranges, as FMP ranks them, and who is due to report or list.',
    () => nav.goView?.('markets', 'stocks'),
    async () => {
      const [result, stories] = await Promise.all([
        loadHubSection('stocks', { country: country.code }),
        storyStrip('stocks', 'Stock news'),
      ]);
      const lists = result.data?.lists || {};
      const status = result.data?.listStatus || {};
      const majors = quoted(result.data?.quotes);
      const openStocks = () => nav.goView?.('markets', 'stocks');
      return [
        /* The same board the markets summary opens with, over this market's
           own listings rather than its benchmarks: one charted, the rest
           beside it, and the list is the chart's control. */
        majors.length ? summaryBoard(majors, {
          label: `Major ${country.short} stocks`, seeAll: `See all ${country.short} stocks`, onAll: openStocks,
        }) : emptyState(result.status, result.message || 'FMP returned no quotes for this market’s largest listings.', true),
        el('div', { class: 'mh-rankings' }, [
          ['gainers', 'Gainers', 'gainers'], ['losers', 'Losers', 'losers'],
          ['volume', 'Highest volume', 'active'], ['volatility', 'Most volatile', null],
        ].map(([id, title, view]) => rankingList(title, lists[id] || [], tabOf('stocks', id),
          view ? () => nav.goView?.('markets', view) : openStocks, status[id]))),
        /* Both calendars ride along with the rankings this section already
           loads — the stocks adapter returns them with the movers, so the
           strips cost nothing the page was not paying for. Earnings has a page
           of its own; the IPO calendar lives on the Market Data stocks page,
           which is where each "See all" goes. */
        calendarBlock('Earnings calendar', result.data?.earnings || [], 'earnings',
          () => nav.goView?.('calendar'), result.data?.earningsStatus,
          'No upcoming reports were returned for this period.'),
        calendarBlock('IPO calendar', result.data?.ipos || [], 'ipo',
          openStocks, result.data?.iposStatus,
          'No upcoming listings were returned for this period.'),
        quantBlock(),
        collectionsBlock(),
        ideasBlock(),
        stories,
      ];
    }, { mark: sectionMark('stocks'), navLabel: `${country.short} stocks` });

  const etfs = section('etfs', 'ETFs',
    'The funds this market trades most, and what they cost to hold in performance and distributions.',
    () => nav.goView?.('markets', 'etfs'),
    async () => {
      const [result, stories] = await Promise.all([
        loadHubSection('etfs', { country: country.code }),
        storyStrip('etfs', 'ETF news'),
      ]);
      const lists = result.data?.lists || {};
      const status = result.data?.listStatus || {};
      const openEtfs = () => nav.goView?.('markets', 'etfs');
      const majors = quoted(result.data?.quotes);
      return [
        majors.length ? summaryBoard(majors, {
          label: 'Major ETFs', seeAll: 'See all ETFs', onAll: openEtfs,
        }) : emptyState(result.status, result.message || 'FMP returned no quotes for this market’s funds.', true),
        el('div', { class: 'mh-rankings' }, ['volume', 'returns', 'dividendYield', 'aum'].map((id) =>
          rankingList(tabOf('etfs', id).label || id, lists[id] || [], tabOf('etfs', id), openEtfs, status[id]))),
        stories,
      ];
    }, { mark: sectionMark('etfs') });

  const commodities = section('commodities', 'Commodities',
    'Energy and metals contracts, quoted by FMP in US dollars or US cents, and the wire that follows them.',
    () => nav.goView?.('markets', 'futures'),
    async () => {
      const [result, stories] = await Promise.all([
        loadHubSection('futures', { country: country.code }),
        storyStrip('futures', 'Commodities news'),
      ]);
      const lists = result.data?.lists || {};
      const status = result.data?.listStatus || {};
      const openFutures = () => nav.goView?.('markets', 'futures');
      /* The futures catalog carries the index contracts too. They belong to
         the hub's board, not to a section this page calls Commodities. */
      const majors = quoted((result.data?.quotes || []).filter((row) => row.category !== 'indices'));
      return [
        majors.length ? summaryBoard(majors, {
          label: 'Major commodities', seeAll: 'See all commodities', onAll: openFutures,
        }) : emptyState(result.status, result.message || 'FMP returned no contract quotes for this period.', true),
        el('div', { class: 'mh-rankings' }, ['energy', 'metals'].map((id) =>
          rankingList(tabOf('futures', id).label || id, lists[id] || [], tabOf('futures', id),
            openFutures, status[id]))),
        stories,
      ];
    }, { mark: sectionMark('futures') });

  const economy = section('economy', 'Economy',
    'Headline inflation as the release calendar reports it, country by country, and what is due next.',
    () => nav.goView?.('markets', 'economy'),
    async () => {
      const [result, stories] = await Promise.all([
        loadHubSection('economy', { country: country.code }),
        storyStrip('economy', 'Economy news'),
      ]);
      const releases = result.data?.worldCalendar || result.data?.calendar || [];
      return [
        track(economyMaps(result.data || {}, result.status, null, { metrics: ['inflation'] })),
        el('section', { class: 'mh-calendar-block' }, [
          heading('Economic calendar', () => nav.goView?.('markets', 'economy')),
          releases.length ? economicReleaseCards(releases, { limit: 12, onAll: () => nav.goView?.('markets', 'economy') })
            : emptyState(result.data?.calendarStatus?.status || result.status,
              result.data?.calendarStatus?.message || 'No releases were returned for this period.', true),
        ]),
        stories,
      ];
    });

  const board = [markets, stocks, etfs, commodities, economy];
  sections.append(...board);
  navigation.replaceChildren(...board.map((node) => el('button', {
    type: 'button', 'data-section': node.sectionId, text: node.navLabel,
    onclick: () => jump(node.sectionId),
  })));

  /* ---- loading ------------------------------------------------------------ */

  if (!hasApiKey()) {
    banner.replaceChildren(el('div', { class: 'mh-connection-note' }, [
      el('span', { text: 'Home is the market, and the market needs a live connection. Add your Financial Modeling Prep key to load quotes, rankings and the wire.' }),
      el('button', { type: 'button', text: 'Open settings', onclick: () => nav.openSettings?.() }),
    ]));
    stream.replaceChildren(emptyState('skipped', 'The wire loads once your FMP key is connected.'));
    for (const node of board) node.remove();
    navigation.remove();
    page.dispose = () => { disposed = true; };
    return page;
  }

  (async () => {
    const [indices, active, gainers, losers, news] = await Promise.all([
      loadHubSection('indices', { country: country.code }),
      fetchMarket('active'), fetchMarket('gainers'), fetchMarket('losers'),
      newsStories('latest'),
    ]);
    if (disposed || !page.isConnected) return;
    const movers = (result) => (Array.isArray(result.data) ? result.data : [])
      .map((row) => normalizeHubQuote(row, { kind: 'stock' })).filter((row) => row.available);
    const levels = (indices.data?.quotes || []).filter((row) => row.available);
    const strip = [...levels.slice(0, 7), ...movers(active).slice(0, 7)];
    banner.replaceChildren(strip.length
      ? el('div', { class: 'hm-banner__rail', tabindex: '0', role: 'group', 'aria-label': 'Indices and active listings' },
        strip.map(tile))
      : emptyState(indices.status, indices.message || '', true));

    /* The block first — one story with the room to be read, three cards under
       it, four headlines beside — then the rest of the wire as rows. */
    const featured = news.stories.slice(0, TOP_STORIES);
    const rows = news.stories.slice(featured.length, featured.length + MORE_STORIES);
    top.replaceChildren(featuredNews(featured, { nav, below: 3, aside: 4 })
      || emptyState(news.status, news.message || 'The wire returned nothing.', true));
    const moreList = rows.length ? el('div', { class: 'nw-list' }, rows.map((item) => storyRow(item, { nav }))) : null;
    stream.replaceChildren(...[
      rows.length ? el('div', { class: 'hm-lead__head' }, [heading('More stories', () => nav.goView?.('news', 'latest'), 'h2')]) : null,
      moreList,
      rows.length ? el('button', { type: 'button', class: 'nw-more', text: 'More market news',
        onclick: () => nav.goView?.('news', 'latest') }) : null,
].filter(Boolean));
    // One batch quote for the symbols on screen, so a chip can say what the
    // story's ticker did. Drawn without it first; filled when it lands.
    quoteMap([...featured, ...rows].flatMap((item) => (item.marks || []).map((mark) => mark.symbol))).then((quotes) => {
      if (disposed || !quotes.size) return;
      if (top.isConnected) top.replaceChildren(featuredNews(featured, { nav, below: 3, aside: 4, quotes }));
      if (moreList?.isConnected) paintQuotes(moreList, quotes);
    }).catch(() => { /* the chips simply carry no change */ });

  })().catch((error) => {
    if (!disposed) stream.replaceChildren(emptyState('error', String(error?.message || error)));
  });

  /* Below the fold, and paid for on arrival there. */
  const lazy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.load?.();
      lazy.unobserve(entry.target);
    }
  }, { rootMargin: '400px 0px' });
  /* Whichever section is topmost under the strip owns the mark. The top inset
     clears the utility bar and the strip itself; the bottom one keeps a
     section from claiming the mark while it is still only a footer away. */
  const current = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) markCurrent(visible[0].target.sectionId);
  }, { rootMargin: '-120px 0px -65% 0px', threshold: 0 });
  for (const node of board) { lazy.observe(node); current.observe(node); }

  page.dispose = () => {
    disposed = true;
    lazy.disconnect();
    current.disconnect();
    for (const node of resources) { node.destroy?.(); node.dispose?.(); }
    resources.clear();
  };
  return page;
}
