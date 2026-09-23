/* Markets overview: instrument charts, rankings and calendars on one canvas.
   The data adapter owns coverage, identities and all vendor field mappings. */
import { el, isNum } from './util.js';
import { hasApiKey } from './fmp.js';
import {
  HUB_SECTIONS, COUNTRIES, ETF_SECTIONS, countryOf, loadHubSection,
  loadUsIndicators, loadIndicatorRange, loadEtfCollections, quoteMap,
} from './markethub-data.js';
import { newsStories } from './newsroom.js';
import { etfCollection } from './etf-collections.js';
import { etfTablesBoard } from './etf-board.js';
import { beatTheMarket } from './beatmarket.js';
import { marketChart } from './markethub-chart.js';
import { sectorsBlock } from './sectorsblock.js';
import { economyMaps } from './economy-maps.js';
import { usEconomy } from './economy-us.js';
import { countryEconomy } from './economy-country.js';
import { economyIndicators } from './economy-chart.js';
import { calendarStrip, yieldCurve, economicCalendar, economicReleaseCards } from './markethub-widgets.js';
import {
  storedCountry, rememberCountry, number, percent, changeOf, signed, arrow, countryFlag,
  instrumentMark, priceText, heading, emptyState, carousel, createDialog, quoteRow,
  featuredNews, storyRow, paintQuotes,
} from './markethub-ui.js';

const NAV_LABELS = { indices: 'Indices', world: 'World stocks', futures: 'Futures',
  bonds: 'Government bonds', corporate: 'Corporate bonds', etfs: 'ETFs', worldEtfs: 'World ETFs', economy: 'Economy' };
const MARKS = { indices: '↗', stocks: 'US', world: '◎', futures: '◈', bonds: '▥', corporate: '▤', etfs: '▦', worldEtfs: '◍', economy: '◷' };
/* A section heading that leads somewhere reads as a link and behaves as one.
   Only the sections with a page of their own in this canvas are listed. */
const SECTION_PAGES = { indices: 'indices', stocks: 'stocks', world: 'stocks', futures: 'futures', corporate: 'corporate', etfs: 'etfs', worldEtfs: 'etfs', economy: 'economy' };
export function renderMarketHub(nav = {}, { section = null } = {}) {
  /* World stocks reads the same under every country, so it belongs to the
     World view and nowhere else: pick a country and the section goes, because
     the companies a reader came for are the ones the stocks section above it
     already ranks. Recomputed whenever the picker moves. */
  let specs = [];
  /* Two sections belong to the World view and nothing else does: World stocks
     and the world's funds. They do not replace the country pair beside them —
     the World view shows US stocks *and* World stocks, and for the same reason
     it shows the US fund section *and* the world's. One is the market a reader
     is standing in, the other is every market at once, and a reader wants both
     on the page that is about everywhere. */
  const WORLD_ONLY = ['world', 'worldEtfs'];
  const visibleSpecs = () => HUB_SECTIONS.filter(spec => spec.id !== 'bonds'
    && (section ? spec.id === section : world || !WORLD_ONLY.includes(spec.id)));
  const resources = new Set();
  const dialogs = new Set();
  const sections = new Map();
  let disposed = false;
  let lazy;
  let activeObserver;
  let mount = 0;
  let world = !new URLSearchParams(location.search).get('country') || new URLSearchParams(location.search).get('country')==='WORLD';
  let country = countryOf(world?'US':storedCountry());
  /* Only a handful of country names take an article, and they are the ones
     whose name says so. The rest read "ETFs of Germany". */
  const countryPhrase = place => `${['US', 'GB', 'NL', 'AE'].includes(place.code) ? 'the ' : ''}${place.name}`;
  const pageTitle = { futures: 'Futures', corporate: 'Corporate Bonds', etfs: 'ETF Market', economy: 'World Economy' }[section];
  const trackResource = node => { resources.add(node); return node; };
  const hub = el('main', { class: 'mh-page', id: 'market-overview' });
  const openDialog = (title, build, onClose) => {
    let dialog;
    dialog = createDialog(title, build, () => { dialogs.delete(dialog); onClose?.(); });
    dialogs.add(dialog);
    return dialog;
  };
  const openInstrument = row => {
    const kind = row.kind || row.meta?.kind || 'stock';
    if (['stock', 'equity'].includes(kind) && nav.goSymbol) return nav.goSymbol(row.symbol);
    let chart;
    openDialog(row.name || row.symbol, () => {
      chart = marketChart({ ...row, quote: row });
      return chart;
    }, () => chart?.destroy?.());
  };
  const openList = (title, rows, spec = {}) => {
    openDialog(title, () => {
      let sort = spec.metricKey || 'marketCap';
      let descending = spec.id !== 'losers';
      const result = el('div', { class: 'mh-dialog__rows' });
      const count = el('span', { class: 'mh-list-count', 'aria-live': 'polite' });
      const search = el('input', { class: 'mh-search', type: 'search', placeholder: 'Search symbol or company', 'aria-label': `Search ${title}` });
      const sorting = el('select', { class: 'mh-select', 'aria-label': 'Sort results' }, [
        ...[...new Set(['name', 'price', 'changesPercentage', 'volume', 'marketCap', spec.metricKey].filter(Boolean))].map(key =>
          el('option', { value: key, text: ({name:'Name',price:'Price',changesPercentage:'Daily change',volume:'Volume',marketCap:'Market cap'})[key] || spec.metricLabel || key, selected: key === sort })),
      ]);
      const direction = el('button', { type: 'button', class: 'mh-icon-button', text: descending ? '↓' : '↑', 'aria-label': descending ? 'Sort ascending' : 'Sort descending', onclick: () => {
        descending = !descending; direction.textContent = descending ? '↓' : '↑';
        direction.setAttribute('aria-label', descending ? 'Sort ascending' : 'Sort descending'); draw();
      } });
      const draw = () => {
        const query = search.value.trim().toLowerCase();
        const filtered = rows.filter(row => `${row.symbol} ${row.name}`.toLowerCase().includes(query)).sort((a,b) => {
          const av = a[sort], bv = b[sort];
          if (av == null) return bv == null ? 0 : 1;
          if (bv == null) return -1;
          return (typeof av === 'string' ? av.localeCompare(String(bv)) : av - bv) * (descending ? -1 : 1);
        });
        count.textContent = `${filtered.length.toLocaleString()} instruments`;
        result.replaceChildren(...(filtered.length ? filtered.map(row => quoteRow(row,spec,openInstrument)) : [emptyState('ok', 'Try another symbol or company name.',true)]));
      };
      search.addEventListener('input', draw);
      sorting.addEventListener('change', () => { sort = sorting.value; draw(); });
      draw();
      return el('div', { class: 'mh-dialog__body' }, [el('div', { class: 'mh-list-tools' }, [search,sorting,direction,count]), result]);
    });
  };
  const showEvents = (title, rows, kind) => openDialog(title, () => el('div', { class: 'mh-dialog__body' }, [
    calendarStrip(rows, { kind, onSymbol: symbol => nav.goSymbol?.(symbol) }),
  ]));
  /**
   * Scroll to a section, and pay for it on the way.
   *
   * The ordering here is the whole of it. A section loads when it is reached,
   * and `load()` replaces its body — which re-lays out the page and **cancels
   * an in-flight smooth scroll**. Scrolling first and loading second therefore
   * left the reader exactly where they were: the click did nothing at all, for
   * as long as the section took to arrive.
   *
   * So the scroll is made twice. Once immediately, so the click visibly does
   * something, and once after the load settles, because everything above the
   * target may have grown in the meantime and the first scroll landed against
   * the old geometry. The second is `instant`: it is a correction of a few
   * hundred pixels, and animating a correction reads as drift.
   */
  const jump = id => {
    const section = sections.get(id);
    if (!section) return;

    history.replaceState(history.state, '', `#market-${id}`);
    section.node.scrollIntoView({ behavior: 'smooth', block: 'start' });

    /* Re-anchor unless the reader took the wheel. Distance is not the test —
       a cancelled scroll leaves the target as far away as it started, so any
       distance threshold blocks exactly the case this exists to fix. Real
       input is the test. */
    let taken = false;
    const takeOver = () => { taken = true; };
    const opts = { passive: true, once: true };
    addEventListener('wheel', takeOver, opts);
    addEventListener('touchstart', takeOver, opts);
    addEventListener('keydown', takeOver, { once: true });

    Promise.resolve(section.load()).then(() => {
      if (taken) return;
      const off = section.node.getBoundingClientRect().top;
      if (Math.abs(off) > 8) section.node.scrollIntoView({ behavior: 'instant', block: 'start' });
    }).catch(() => { /* the section reports its own failure in its body */ })
      .finally(() => {
        removeEventListener('wheel', takeOver);
        removeEventListener('touchstart', takeOver);
        removeEventListener('keydown', takeOver);
      });

    for (const button of navigation.querySelectorAll('[data-section]')) {
      const active = button.dataset.section === id;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current','location'); else button.removeAttribute('aria-current');
    }
  };

  /* ---- the country picker -------------------------------------------------
     The page title is the country, and its arrow is the only control that
     changes which market every section below describes. */
  const navLabel = spec => spec.id === 'stocks' ? `${country.short} stocks`
    : spec.id === 'etfs' ? `${country.short} ETFs` : NAV_LABELS[spec.id] || spec.title;
  const sectionTitle = spec => spec.id === 'stocks' ? `${country.short} stocks`
    : spec.id === 'indices' ? `${world?'World':country.short} indices`
      : spec.id === 'etfs' ? `ETFs of ${countryPhrase(country)}` : spec.title;
  const scopeOf = spec => spec.scope === 'global' ? 'Global'
    : spec.scope === 'us' && country.code !== 'US' ? 'United States' : null;
  const flag = (place, large = false) => countryFlag(place.code, { large });
  const navigation = el('nav', { class: 'mh-navigation', 'aria-label': 'Market sections' });
  const title = el('h1', {});
  const summary = el('summary', { 'aria-haspopup': 'menu' }, [title, el('span', { class: 'mh-picker__caret', 'aria-hidden': 'true', text: '⌄' })]);
  const menu = el('div', { class: 'mh-picker__menu', role: 'menu', 'aria-label': 'Country' });
  const picker = el('details', { class: 'mh-picker' }, [summary, menu]);
  const strapline = el('span', {});
  const setCountry = code => {
    const next = countryOf(code);
    if (next.code === country.code && world === (code==='WORLD')) return;
    world=code==='WORLD';
    country = next;
    rememberCountry(world?'WORLD':next.code);
    syncCountry();
    mountSections();
    hub.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  function syncCountry() {
    specs = visibleSpecs();
    title.replaceChildren(world?el('span',{text:'🌐'}):flag(country, true), el('span', { text: world?'World':country.name }));
    summary.setAttribute('aria-label', `Market data for ${world?'World':country.name}. Choose another country`);
    strapline.textContent = world?'Global markets: indices, equities, funds and releases':`Indices, equities, funds and releases, as FMP covers ${country.name}`;
    menu.replaceChildren(...[...new Set(COUNTRIES.map(place => place.group))].flatMap(group => [
      el('p', { class: 'mh-picker__group', text: group }),
      ...COUNTRIES.filter(place => place.group === group).map(place => el('button', {
        type: 'button', role: 'menuitemradio', 'aria-checked': String(!world && place.code === country.code),
        class: `mh-picker__item${!world && place.code === country.code ? ' is-active' : ''}`,
        onclick: () => { picker.open = false; setCountry(place.code); },
      }, [flag(place), el('span', { class: 'mh-picker__name', text: place.name })])),
    ]));
    menu.replaceChildren(el('button',{type:'button',class:'mh-picker__item',role:'menuitemradio','aria-checked':String(world),text:'🌐 World',onclick:()=>{picker.open=false;setCountry('WORLD');}}),...menu.children);
    // The strip is in-page navigation, every entry. US stocks and World stocks
    // used to leave for their own boards, which made two of the tabs behave
    // unlike the other seven — a strip that scrolls you six times and navigates
    // the seventh is a strip you cannot trust. Those boards are still reachable
    // from each section's own heading, which is where a "go somewhere" link
    // belongs.
    navigation.replaceChildren(...specs.map(spec => el('button', {
      type: 'button', 'data-section': spec.id, text: navLabel(spec),
      onclick: () => jump(spec.id),
    })));
  }
  // A menu this tall wants the two dismissals a <details> does not give it.
  const closeOutside = event => { if (picker.open && !picker.contains(event.target)) picker.open = false; };
  const closeOnEscape = event => { if (event.key === 'Escape' && picker.open) { picker.open = false; summary.focus?.(); } };
  document.addEventListener?.('click', closeOutside);
  document.addEventListener?.('keydown', closeOnEscape);

  hub.append(el('header', { class:'mh-hero' }, [
    el('div',{class:'mh-eyebrow',text:'MARKET DATA'}), picker,
    el('div',{class:'mh-hero__meta'},[
      strapline,el('span',{class:'mh-meta-divider','aria-hidden':'true',text:'·'}),
      el('button',{type:'button',class:`mh-connection ${hasApiKey()?'is-connected':''}`,text:hasApiKey()?'FMP connected':'Connect FMP',onclick:()=>nav.openSettings?.()},[
      ]),
    ]),
  ]),navigation);
  if (section) {
    hub.setAttribute('id', `market-page-${section}`);
    hub.classList.add('mi-page');
    const hero = hub.querySelector('.mh-hero');
    /* The ETFs page used to carry its country in the title — "ETFs of the
       United States". It is called ETF Market now, so the country moves into
       the meta line rather than disappearing: the Overview tab below is still
       scoped to one market, and a page that stopped saying which would be
       quietly wrong. The ETF Tables board says the opposite about itself, in
       its own header, because it is the one tab the scope does not reach. */
    hero.replaceChildren(
      el('div', { class: 'mh-eyebrow' }, [el('button', { type: 'button', class: 'mi-crumb', onclick: () => nav.goView?.('markets', 'overview') }, ['Market Data', arrow()])]),
      el('h1', { class: 'mi-title', text: pageTitle }),
      el('div', { class: 'mh-hero__meta' }, [
        el('button', { type: 'button', class: `mh-connection ${hasApiKey() ? 'is-connected' : ''}`, text: hasApiKey() ? 'FMP connected' : 'Connect FMP', onclick: () => nav.openSettings?.() }),
        section === 'etfs' ? el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }) : null,
        section === 'etfs' ? el('span', { class: 'mh-scope-line' }, [
          flag(country), el('span', { text: `Overview scoped to ${countryPhrase(country)}` }),
        ]) : null,
      ].filter(Boolean)),
    );
  }
  if (!hasApiKey()) hub.append(el('div',{class:'mh-connection-note'},[
    el('span',{text:'Connect your Financial Modeling Prep key to load quotes, charts and calendars.'}),
    el('button',{type:'button',text:'Open settings',onclick:()=>nav.openSettings?.()}),
  ]));
  const body = el('div', { class: 'mh-sections' });
  /* The ETFs page is three tabs rather than one scroll: the overview in `body`,
     and the screener or the news wire in here. Everything else on this canvas
     has one tab, so `board` stays empty and hidden for them. */
  const board = el('div', { class: 'mh-board', hidden: true });
  hub.append(body, board);

  function chartBlock(spec, quotes) {
    if (!quotes.length) return null;
    const selected = quotes.find(row => isNum(row.price)) || quotes[0];
    const chart = trackResource(marketChart({ ...selected, quote:selected }));
    const buttons = [];
    const choose = row => {
      for (const button of buttons) {
        const active = button.dataset.symbol === row.symbol;
        button.classList.toggle('is-active',active);
        button.setAttribute('aria-selected',String(active));
        button.tabIndex = active ? 0 : -1;
      }
      chart.setSymbol({ ...row, quote:row });
    };
    quotes.forEach(row => {
      const active = row.symbol === selected.symbol;
      const button = el('button',{type:'button',role:'tab',class:`mh-quote-tab${active?' is-active':''}`,'data-symbol':row.symbol,
        'aria-selected':String(active),tabindex:active?'0':'-1','aria-label':`Show ${row.shortName || row.name} chart`,onclick:()=>choose(row)},[
        instrumentMark(row,true),el('span',{class:'mh-quote-tab__text'},[
          el('span',{class:'mh-quote-tab__name',text:row.shortName || row.name || row.symbol}),
          el('span',{class:'mh-quote-tab__values'},[priceText(row),signed(changeOf(row))]),
        ]),
      ]);
      button.addEventListener('keydown',event=>{
        if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
        event.preventDefault();
        const index=buttons.indexOf(button);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
        buttons[next].focus(); buttons[next].scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'}); choose(quotes[next]);
      });
      buttons.push(button);
    });
    const rail=trackResource(carousel(buttons,{label:`${sectionTitle(spec)} symbols`,className:'mh-quote-tabs'}));
    rail.querySelector('.mh-rail').setAttribute('role','tablist');
    return el('div',{class:'mh-chart-block'},[rail,chart]);
  }

  /* ---- the ETF page's news tab ---------------------------------------------
     The same ETF wire Market News carries as one of its six categories, read
     through the same function so the two can never disagree about what an ETF
     story is: stories the vendor filed under one of the funds this product
     tracks, plus market-wide stories that name one.

     It is the wire itself rather than a summary of it. A cut-down version
     would only raise the question of what was cut, and the page it is cut from
     is one click away either way. */
  const NEWS_LEAD = 4;
  const NEWS_PAGE = 12;
  function etfNews() {
    const host = el('div', { class: 'mh-news' });
    /* The story components and their styles are the newsroom's, reused by
       class rather than reimplemented: a fund story should look the same
       here as it does on Market News, and two stylesheets for one row is
       how they stop looking the same. */
    const stream = el('div', { class: 'nw-stream' }, [emptyState('loading', '', true)]);
    let gone = false;

    host.append(
      el('div', { class: 'mh-news__head' }, [
        el('h2', { class: 'mh-heading', text: 'ETF news' }),
        el('button', { type: 'button', class: 'mh-see-all',
          onclick: () => nav.goView?.('news', 'etfs') }, ['The full wire on Market News', arrow()]),
      ]),
      el('p', { class: 'mh-news__lede', text: 'Stories FMP filed under one of the funds '
        + 'this product tracks, and market-wide stories that name one. Read from the vendor’s own '
        + 'symbol tag and a name match — nothing here is ranked, scored or sentiment-tagged, and '
        + 'no story is promoted.' }),
      stream,
    );

    newsStories('etfs').then((result) => {
      if (gone || !host.isConnected) return;
      const rows = result.stories || [];
      if (!rows.length) {
        stream.replaceChildren(emptyState(result.status,
          result.message || 'The wire returned no fund stories in the window the vendor serves.'));
        return;
      }
      const lead = rows.slice(0, NEWS_LEAD);
      const tail = rows.slice(lead.length);
      const featured = el('div', { class: 'nw-featured' },
        [featuredNews(lead, { nav, below: 0, aside: NEWS_LEAD - 1 })]);
      const list = el('div', { class: 'nw-list' });
      const more = el('button', { type: 'button', class: 'nw-more', onclick: () => next() });
      let shown = 0;
      function next() {
        const batch = tail.slice(shown, shown + NEWS_PAGE);
        list.append(...batch.map((item) => storyRow(item, { nav })));
        shown += batch.length;
        const left = tail.length - shown;
        more.textContent = left > 0 ? `Show ${Math.min(left, NEWS_PAGE)} more — ${left} left` : '';
        more.hidden = left <= 0;
        // A page of rows is one batch quote, not one per story.
        quoteMap(batch.flatMap((item) => (item.marks || []).map((mark) => mark.symbol)))
          .then((quotes) => { if (!gone && list.isConnected) paintQuotes(list, quotes); })
          .catch(() => { /* the ticks simply carry no change */ });
      }
      next();
      stream.replaceChildren(
        el('p', { class: 'nw-count', text: `${rows.length.toLocaleString()} ${rows.length === 1 ? 'story' : 'stories'}` }),
        featured, list, more,
      );
      quoteMap(lead.flatMap((item) => (item.marks || []).map((mark) => mark.symbol))).then((quotes) => {
        if (gone || !featured.isConnected || !quotes.size) return;
        featured.replaceChildren(featuredNews(lead, { nav, below: 0, aside: NEWS_LEAD - 1, quotes }));
      }).catch(() => { /* the chips simply carry no change */ });
    }).catch((error) => {
      if (!gone && host.isConnected) stream.replaceChildren(emptyState('error', String(error?.message || error)));
    });

    host.dispose = () => { gone = true; };
    return host;
  }

  /* ---- the ETF page's tabs -------------------------------------------------
     Two, and each answers a different question. **Overview** is this market's
     funds ranked on the numbers the feed returns. **ETF tables** is the
     curated side: seventeen boards of funds somebody named, which is the only
     way to say "what did gold do" when the vendor publishes no asset class.

     The screener used to be a third tab, embedded. It is a page of its own now
     — its own rail menu at `?view=etfs` — and a tool that exists in two places
     is a tool whose state a reader has to keep track of twice: a collection
     picked in the tab and a collection picked on the page were two different
     answers to the same question. Everything that used to open the tab now
     opens the page, with the collection carried across.

     Fund news is not a tab either: it is a wire of its own on Market News,
     where it sits beside the other five categories rather than behind a tab
     that is empty most days. */
  const ETF_TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'tables', label: 'ETF Tables' },
    { id: 'beat', label: 'Beat the Market' },
    { id: 'news', label: 'News' },
  ];
  let etfTab = 'overview';
  let etfViews = null;
  function remember(changes) {
    try {
      const url = new URL(location.href);
      for (const [key, value] of Object.entries(changes)) {
        if (value == null || value === 'overview' || value === '') url.searchParams.delete(key);
        else url.searchParams.set(key, String(value));
      }
      history.replaceState(history.state, '', url);
    } catch { /* history unavailable */ }
  }
  function setEtfTab(id) {
    etfTab = ETF_TABS.some(item => item.id === id) ? id : 'overview';
    remember({ board: etfTab });
    for (const button of navigation.querySelectorAll('[data-tab]')) {
      const active = button.dataset.tab === etfTab;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    body.hidden = etfTab !== 'overview';
    board.hidden = etfTab === 'overview';
    if (etfTab === 'overview') { board.replaceChildren(); return; }
    etfViews ||= {};
    /* The boards are US-listed funds and read the same under every country, so
       this tab does not follow the picker — and says so in its own header
       rather than quietly ignoring it. */
    if (etfTab === 'tables') etfViews.tables ||= trackResource(etfTablesBoard({
      initial: new URLSearchParams(location.search).get('table'),
      onPick: openInstrument,
      onBoard: (id) => remember({ table: id }),
      onNavigate: (where) => { if (where === 'screener') openEtfScreener(); },
    }));
    /* The same basket the Stocks page carries, pointed at funds. One module,
       one rule, one benchmark — two lists that disagreed about what beating
       the market meant would be worse than one that only covered half of it. */
    if (etfTab === 'beat') etfViews.beat ||= trackResource(beatTheMarket({
      kind: 'etfs', country: country.code, nav,
    }));
    if (etfTab === 'news') etfViews.news ||= trackResource(etfNews());
    board.replaceChildren(etfViews[etfTab]);
  }
  /**
   * Leave for the ETF Screener page, on one collection.
   *
   * What a collection heading does, and what the tables board's own "open the
   * screener" does. The country goes with it: this page is scoped to a market
   * and the screener should open on the same one rather than resetting to the
   * United States under a reader who picked Germany.
   */
  function openEtfScreener(collection = 'all') {
    nav.goView?.('etfs', 'screener', { country: country.code, kind: 'etfs', collection });
  }

  /* ---- the collection sections --------------------------------------------
     What TradingView's ETF page leads with, and what this one can honestly
     fill: the funds whose own name states the holding, largest first, with the
     rule printed and the whole collection one click away in the screener. */
  function etfCollectionSections() {
    const host = el('section', { class: 'mh-collections', 'aria-label': 'Fund collections' }, [
      el('h2', { class: 'mh-heading mh-heading--section' }, [
        el('span', { class: 'mh-section-mark mh-section-mark--etfs', 'aria-hidden': 'true', text: MARKS.etfs }), 'ETF collections',
      ]),
      el('p', { class: 'mh-section-description', text: 'Loading the fund listings for this country…' }),
      el('div', { class: 'mh-rankings' }, ETF_SECTIONS.map(item => el('section', { class: 'mh-ranking', 'aria-label': item.title }, [
        heading(item.title), emptyState('loading', '', true),
      ]))),
    ]);
    loadEtfCollections(country.code).then(result => {
      if (disposed || !host.isConnected) return;
      host.replaceChildren(
        host.firstChild,
        el('p', { class: 'mh-section-description', text: result.note || result.message || '' }),
        el('div', { class: 'mh-rankings' }, ETF_SECTIONS.map(item => {
          const rows = result.collections?.[item.id] || [];
          const rule = etfCollection(item.id).note;
          const open = () => openEtfScreener(item.id);
          return el('section', { class: 'mh-ranking', 'aria-label': item.title }, [
            heading(item.title, rows.length ? open : null),
            el('p', { class: 'mh-panel-note', text: rule }),
            rows.length ? el('div', { class: 'mh-rows' }, rows.map(row => quoteRow(row, {}, openInstrument)))
              : emptyState(result.status || 'ok', result.message
                || `No fund FMP lists for ${country.name} states this holding in its name.`, true),
            rows.length ? el('button', { type: 'button', class: 'mh-see-all', onclick: open },
              [`See all ${item.title.toLowerCase()}`, arrow()]) : null,
          ].filter(Boolean));
        })),
      );
    });
    return host;
  }

  function rankings(spec, data, result) {
    return el('div',{class:'mh-rankings'},(spec.tabs || []).map(list=>{
      const rows=data.lists?.[list.id] || [];
      const state=data.listStatus?.[list.id];
      const status=typeof state==='string'?state:state?.status || (rows.length?'ok':result.status);
      const title=list.label || list.title;
      const scopeNote=list.note || (spec.id==='world' ? (list.id==='largest' ? 'Selected leading companies · market caps in USD' : 'Selected major employers · latest reported headcount')
        : spec.id==='etfs' ? (country.code==='US' ? 'Selected US-listed funds' : `Funds FMP lists in ${country.name}`)
          : list.id==='volatility' ? (country.movers ? 'Intraday high–low range among active stocks and movers' : 'Intraday high–low range within the ranked listings above') : '');
      const onAll=()=>openList(title,rows,list);
      return el('section',{class:'mh-ranking','aria-label':title},[
        heading(title,rows.length?onAll:null),
        scopeNote && el('p',{class:'mh-panel-note',text:scopeNote}),
        list.metricKey && list.metricKey !== 'changesPercentage' && el('div',{class:'mh-column-labels'},[
          el('span',{text:'Symbol'}),el('span',{text:'Price & change'}),el('span',{text:list.metricLabel || list.metricKey}),
        ]),
        rows.length?el('div',{class:'mh-rows'},rows.slice(0,6).map(row=>quoteRow(row,list,openInstrument)))
          :emptyState(status,state?.message || list.emptyMessage || '',true),
        rows.length?el('button',{type:'button',class:'mh-see-all',onclick:onAll},[list.seeAll || `See all ${title.toLowerCase()}`,arrow()]):null,
        status==='error'?el('button',{type:'button',class:'mh-see-all',text:'Retry',onclick:()=>sections.get(spec.id)?.load(true)}):null,
      ]);
    }));
  }

  function drawSection(spec, result, target) {
    const data=result.data || {};
    const quotes=data.quotes || [];
    const nodes=[];
    if (['bonds'].includes(spec.id)) {
      if (data.unavailable) nodes.push(emptyState('unavailable',data.unavailable));
      else {
        nodes.push(heading('Yield curve'),yieldCurve(data.curve || []));
        const curve=data.curve || [];
        nodes.push(el('div',{class:'mh-rankings'},[
          el('section',{class:'mh-ranking'},[
            heading('US Treasury yields'),
            curve.length?el('div',{class:'mh-yields'},curve.map(row=>el('div',{class:'mh-yield-row'},[
              el('span',{text:row.label}),el('strong',{text:isNum(row.value)?`${number(row.value,3)}%`:'—'}),
            ]))):emptyState(result.status,'Daily Treasury rates from FMP.',true),
          ]),
          el('section',{class:'mh-ranking'},[heading('Major 10Y bonds'),emptyState('unavailable','FMP supplies the US Treasury curve. Comparable government bond yields for other countries are not available from this feed.',true)]),
        ]));
      }
    } else if(spec.id==='economy') {
      /* Two of the three blocks here are not about the country in the picker:
         the charted series and the board under them are a United States
         dataset, and the maps are a view of every country at once. A reader
         who picked France came for France, so under a country the section is
         that country's own releases instead — and the United States keeps the
         series board, because for the US that *is* the country's data. The
         World view and the World Economy page keep all three: that is the
         scope they exist at. */
      const worldScope = section === 'economy' || world;
      if (worldScope || country.code === 'US') {
        // The charted series and the boarded ones are the same series: the rail
        // leads with the six that load with the section, and gains the rest in
        // the moment the board below buys them.
        const charts=trackResource(economyIndicators(data.usIndicators || new Map(), {
          status: result.status,
          loadRange: (name, windows, onProgress) => loadIndicatorRange(name, windows, onProgress),
        }));
        nodes.push(charts);
        if (worldScope) nodes.push(trackResource(economyMaps(data, result.status, () => sections.get(spec.id)?.load(true))));
        nodes.push(usEconomy(data.usIndicators || new Map(), {
          status: result.status,
          loadMore: async (names, onProgress) => {
            const extra = await loadUsIndicators(names, onProgress);
            charts.refresh?.(extra);
            return extra;
          },
        }));
      } else nodes.push(countryEconomy(country, data.countryReleases || [], {
        status: data.calendarStatus?.status || result.status,
        message: data.calendarStatus?.message || result.message,
      }));
    } else if(quotes.length) nodes.push(chartBlock(spec,quotes));
    const worldIndices=data.worldIndices?.length ? data.worldIndices : data.lists?.world || [];
    if(spec.id==='indices' && worldIndices.length){
      const rows=worldIndices;
      nodes.push(el('section',{class:'mh-world-indices'},[
        heading('World indices',()=>openList('World indices',rows)),
        trackResource(carousel(rows.map(row=>el('button',{type:'button',class:'mh-world-card',onclick:()=>openInstrument(row)},[
          el('span',{class:'mh-world-card__head'},[instrumentMark(row),el('span',{},[el('strong',{text:row.shortName || row.symbol}),el('small',{text:row.name})])]),
          priceText(row),signed(changeOf(row)),
        ])),{label:'world indices',className:'mh-world-rail'})),
      ]));
    }
    /* The fund sits last in the indices rail, so the line above the rail is
       where it gets named: it is a different kind of instrument from the tabs
       beside it and should not have to be worked out from the price. */
    if(spec.id==='indices' && data.funds?.length)nodes.unshift(el('p',{class:'mh-section-description',
      text:`Benchmark indices for ${country.name}, and last in the rail, ${data.funds[0].name} (${data.funds[0].symbol}) — the US-listed fund that tracks this market, priced in dollars rather than index points.`}));
    if(spec.id==='corporate')nodes.unshift(el('p',{class:'mh-section-description',text:data.description
      || 'US-listed corporate bond ETFs. Individual corporate bond quotes, coupons and maturities are not supplied by FMP.'}));
    if(spec.id==='world')nodes.unshift(el('p',{class:'mh-section-description',text:'International companies, with US-listed ADRs preferred and one listing per company.'}));
    /* Futures are the one section that genuinely cannot follow the picker, so
       it says why rather than leaving the Global chip to carry it: FMP's
       commodities feed is a fixed list of forty contracts traded on US
       exchanges, and it holds no local contract to switch to. */
    if(spec.id==='futures')nodes.unshift(el('p',{class:'mh-section-description',
      text:'Forty global benchmark contracts, all traded on US exchanges and quoted by FMP in US dollars or US cents. The vendor lists no local contract — there is no DAX, Nikkei or Euro Stoxx future in this feed, and the index futures are the four US ones — so this section reads the same under every country.'}));
    if(spec.id==='stocks' && !country.movers)nodes.unshift(el('p',{class:'mh-section-description',
      text:`FMP publishes whole-market mover feeds for US exchanges only. These rankings cover the largest listings in ${country.name} that its screener returns, ranked on the latest quotes.`}));
    if(spec.tabs?.length && spec.id!=='indices') nodes.push(rankings(spec,data,result));
    // Only on the page that leads with them: the overview carries eight
    // sections already and would be paying for listings nobody asked for.
    if(spec.id==='etfs' && section==='etfs') nodes.push(etfCollectionSections());
    for(const [key,title,kind] of [['earnings','Earnings Calendar','earnings'],['ipos','IPO Calendar','ipo']]){
      if(!['stocks','world'].includes(spec.id))continue;
      const rows=data[key] || [];
      nodes.push(el('section',{class:'mh-calendar-block'},[
        heading(title,rows.length?()=>showEvents(title,rows,kind):null),
        rows.length?calendarStrip(rows,{kind,onSymbol:symbol=>nav.goSymbol?.(symbol),onAll:()=>showEvents(title,rows,kind)})
          :emptyState(data[`${key}Status`]?.status || result.status,data[`${key}Status`]?.message || (result.status==='ok'?`No upcoming ${kind==='ipo'?'listings':'reports'} were returned for this period.`:''),true),
      ]));
    }
    if(spec.id==='economy'){
      const releases = section === 'economy' ? data.worldCalendar || [] : data.calendar || data.events || [];
      const calendarTitle = section === 'economy' ? 'World Economic Calendar' : `Economic Calendar · ${country.name}`;
      // Cards for what is next, the table for everything: a strip a reader
      // scrolls is the wrong shape for comparing a hundred releases, so the
      // table stays — under the strip on the page that exists for it, behind
      // the heading everywhere else.
      const openReleases=()=>openDialog(calendarTitle,()=>el('div',{class:'mh-dialog__body'},[economicCalendar(releases)]));
      nodes.push(el('section',{class:'mh-calendar-block'},[
        heading(calendarTitle,releases.length?openReleases:null),
        releases.length ? economicReleaseCards(releases,{onAll:openReleases})
          : emptyState(data.calendarStatus?.status || result.status,data.calendarStatus?.message || `No releases tagged ${country.name} were returned for this period.`,true),
      ]));
      if(section==='economy' && releases.length) nodes.push(el('section',{class:'mh-calendar-block'},[
        heading(`All ${releases.length.toLocaleString()} releases in this period`),
        economicCalendar(releases),
      ]));
    }
    const notes=[...(result.notes || []),...(data.notes || [])].filter(Boolean);
    if(notes.length) nodes.push(el('details',{class:'mh-coverage'},[
      el('summary',{text:'Data coverage'}),el('div',{},notes.map(note=>el('p',{text:note}))),
    ]));
    if(result.status==='error'||result.status==='gated') nodes.unshift(el('div',{class:'mh-section-error'},[
      el('span',{text:result.message || 'Some data could not be loaded.'}),
      el('button',{type:'button',text:'Retry',onclick:()=>sections.get(spec.id)?.load(true)}),
    ]));
    if(!nodes.length)nodes.push(emptyState(result.status,result.message));
    target.replaceChildren(...nodes.filter(Boolean));
  }

  /* Every section is rebuilt when the country changes: the charts, rails and
     dialogs of the country left behind are disposed, not hidden. */
  function mountSections() {
    const stamp = ++mount;
    const place = country;
    lazy?.disconnect();
    activeObserver?.disconnect();
    for (const resource of resources) { resource.destroy?.(); resource.dispose?.(); }
    resources.clear();
    sections.clear();
    for (const dialog of dialogs) dialog.close();
    for(const spec of specs){
      const content=el('div',{class:'mh-section__body'},[emptyState('loading','',true)]);
      const scope=scopeOf(spec);
      // The equity mark carries the country, so the US stripes never sit next
      // to another country's name.
      const local=spec.id==='stocks'&&country.code!=='US';
      const page=section ? null : SECTION_PAGES[spec.id];
      /* Whose market a section describes is not always known before it loads:
         corporate bonds follow the country where its exchange lists the funds
         and fall back to the US set where it does not. So the badge is a node
         the load can speak through, rather than a label fixed in advance. */
      const badge=el('span',{class:'mh-scope',hidden:!scope,text:scope || ''});
      const setScope=label=>{
        badge.hidden=!label;
        badge.textContent=label || '';
        if(label)badge.title=`This section covers ${label.toLowerCase()==='global'?'every market':label}`;
        node.setAttribute('aria-label',`${sectionTitle(spec)}${label?` · ${label}`:''}`);
      };
      const title=el('h2',{class:'mh-heading mh-heading--section'},[
        el('span',{class:`mh-section-mark mh-section-mark--${local?'local':spec.id}`,'aria-hidden':'true',text:local?country.code:MARKS[spec.id]}),
        page?el('button',{type:'button',onclick:()=>nav.goView?.('markets',page,{country:spec.id==='world'?'WORLD':country.code}),'aria-label':`${sectionTitle(spec)} — open the board`},[sectionTitle(spec),arrow()]):sectionTitle(spec),
        badge,
      ].filter(Boolean));
      const node=el('section',{class:`mh-section mh-section--${spec.id}`,id:`market-${spec.id}`,'aria-label':`${sectionTitle(spec)}${scope?` · ${scope}`:''}`},[section === 'economy' ? null : title,content]);
      setScope(scope);
      let loaded=false, loading=false, generation=0;
      const load=async(force=false)=>{
        if(disposed||loading||(loaded&&!force))return;
        loading=true;
        const current=++generation;
        node.setAttribute('aria-busy','true');
        try{
          const result={...await loadHubSection(spec.id,{country:place.code,refresh:force,
            usSeries:section==='economy'||world||place.code==='US'})};
          if(world && spec.id==='indices'){
            const all=[...(result.data.quotes||[]).filter(r=>r.meta?.primary||r.primary),...(result.data.worldIndices||[])];
            result.data={...result.data,quotes:all,lists:{...result.data.lists,home:all}};
          }
          if(disposed||generation!==current||stamp!==mount)return;
          // Dispose only resources belonging to a refreshed section.
          for(const resource of resources){if(content.contains(resource)){
            resource.destroy?.();resource.dispose?.();resources.delete(resource);
          }}
          setScope(result.data?.scopeLabel || scope);
          drawSection(spec,result,content);
          loaded=true;
        }catch(error){
          if(!disposed&&stamp===mount) content.replaceChildren(emptyState('error',String(error?.message || error)),el('button',{class:'mh-see-all',text:'Retry',onclick:()=>load(true)}));
        }finally{loading=false;node.removeAttribute('aria-busy');}
      };
      sections.set(spec.id,{node,load});
    }
    /* Sectors sits above the equity sections: it is the breakdown of the market
     those sections then rank inside, so it reads as context for them rather
     than as another ranking beside them. It is only built on the overview —
     a dedicated section page is about one asset class and a sector map of the
     whole market would be beside the point there. */
    const ordered = [...sections.values()].map(s=>s.node);
    if (!section) {
      const at = ordered.findIndex(n => n.id === 'market-stocks');
      // The heading leads to the Sectors page, like every other section
      // heading on this canvas that has a page of its own.
      const block = sectorsBlock({ onOpen: () => nav.goView?.('sectors', 'all') });
      resources.add(block);
      ordered.splice(at < 0 ? ordered.length : at, 0, block);
    }
    body.replaceChildren(...ordered);
    lazy=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){
        const id=entry.target.id.replace('market-','');sections.get(id)?.load();lazy.unobserve(entry.target);
      }
    },{rootMargin:'350px 0px'});
    activeObserver=new IntersectionObserver(entries=>{
      const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
      if(!visible.length)return;
      const id=visible[0].target.id.replace('market-','');
      for(const button of navigation.querySelectorAll('[data-section]')){
        const active=button.dataset.section===id;button.classList.toggle('is-active',active);
        if(active)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
      }
    },{rootMargin:'-110px 0px -65% 0px',threshold:0});
    sections.forEach(({node})=>{lazy.observe(node);activeObserver.observe(node);});
    sections.get(section || 'indices')?.load();
  }

  syncCountry();
  /* The ETFs page is the one dedicated page with tabs rather than anchors: its
     screener and its news wire are not sections of the overview, they are
     places of their own. */
  if (section === 'etfs') navigation.replaceChildren(...ETF_TABS.map(item => el('button', {
    type: 'button', 'data-tab': item.id, class: item.id === 'overview' ? 'is-active' : '',
    text: item.label, onclick: () => setEtfTab(item.id),
  })));
  else if (section) navigation.replaceChildren(
    el('button', { type: 'button', class: 'is-active', 'data-section': section, text: 'Overview', onclick: () => jump(section) }),
    ...(section === 'economy' ? [
      el('button', { type: 'button', text: 'Indicators',
        onclick: () => body.querySelector('#economy-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }),
      ...[['gdp', 'GDP growth'], ['inflation', 'Inflation']].map(([id, label]) => el('button', {
        type: 'button', text: label, onclick: () => body.querySelector(`#economy-map-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      })),
      el('button', { type: 'button', text: 'United States',
        onclick: () => body.querySelector('#economy-us')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }),
    ] : []),
    ...specs[0].tabs.map(list => el('button', { type: 'button', text: list.label, onclick: () => {
      const ranking = [...body.querySelectorAll('.mh-ranking')].find(node => node.getAttribute('aria-label') === list.label);
      ranking?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } })),
  );
  mountSections();
  if (section === 'etfs') {
    const asked = new URLSearchParams(location.search).get('board');
    if (asked && asked !== 'overview') setEtfTab(asked);
  }
  hub.append(el('footer',{class:'mh-footer'},[
    el('span',{text:'Market data by Financial Modeling Prep. Quotes may be delayed.'}),
    el('button',{type:'button',text:'Back to top ↑',onclick:()=>hub.scrollIntoView({behavior:'smooth'})}),
  ]));
  const hash=location.hash.replace('#market-','');
  if(sections.has(hash))requestAnimationFrame(()=>jump(hash));
  hub.dispose=()=>{
    disposed=true;lazy?.disconnect();activeObserver?.disconnect();
    document.removeEventListener?.('click',closeOutside);
    document.removeEventListener?.('keydown',closeOnEscape);
    for(const resource of resources){resource.destroy?.();resource.dispose?.();}
    resources.clear();for(const dialog of dialogs)dialog.close();dialogs.clear();
  };
  return hub;
}
