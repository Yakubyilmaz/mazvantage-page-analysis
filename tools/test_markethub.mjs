/* Run: node tools/test_markethub.mjs
   Pure Node regression checks. The small DOM shim tests event/data integration,
   not browser layout; visual QA uses market-hub-preview.html separately.
   No network requests, package installs, or real credentials are used. */
import assert from 'node:assert/strict';
import { FIXTURE_KEY, createFixtureFetch, fixtureQuote } from './market-hub-preview-fixtures.mjs';

class TestNode {
  constructor(tag = '', text = '') {
    this.tagName = tag.toUpperCase(); this.attributes = new Map(); this.childNodes = []; this.parentNode = null;
    this.nodeType = tag ? 1 : 3; this.data = text; this.listeners = new Map(); this.value = '';
    this.scrollLeft = 0; this.clientWidth = 1000; this.scrollWidth = 1800; this.clientHeight = 385;
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.dataset = new Proxy({}, { get: (_, key) => this.getAttribute(`data-${String(key).replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)}`) });
  }
  get children() { return this.childNodes.filter(node => node.nodeType === 1); }
  get parentElement() { return this.parentNode; }
  get isConnected() { return this === document.body || Boolean(this.parentNode?.isConnected); }
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value) { if (this.nodeType === 3) this.data = String(value); else this.replaceChildren(String(value)); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get id() { return this.getAttribute('id') || ''; }
  get classList() {
    const set = () => new Set(this.className.split(/\s+/).filter(Boolean));
    return { contains: name => set().has(name), add: (...names) => { const all = set(); names.forEach(name => all.add(name)); this.className = [...all].join(' '); },
      remove: (...names) => { const all = set(); names.forEach(name => all.delete(name)); this.className = [...all].join(' '); },
      toggle: (name, force) => { const active = force ?? !set().has(name); this.classList[active ? 'add' : 'remove'](name); return active; } };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'value') this.value = String(value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  append(...nodes) { for (const input of nodes) { const node = input instanceof TestNode ? input : new TestNode('', String(input)); node.remove(); node.parentNode = this; this.childNodes.push(node); } }
  replaceChildren(...nodes) { this.childNodes.forEach(node => { node.parentNode = null; }); this.childNodes = []; this.append(...nodes); }
  remove() { if (this.parentNode) { const parent = this.parentNode; parent.childNodes = parent.childNodes.filter(node => node !== this); this.parentNode = null; } }
  replaceWith(other) { const parent = this.parentNode; if (!parent) return; const index = parent.childNodes.indexOf(this); other.remove(); parent.childNodes[index] = other; other.parentNode = parent; this.parentNode = null; }
  contains(other) { return this === other || this.children.some(node => node.contains(other)); }
  addEventListener(type, handler, options = {}) { const list = this.listeners.get(type) || []; list.push({ handler, once: options.once }); this.listeners.set(type, list); }
  dispatchEvent(event) {
    event.target ||= this; event.preventDefault ||= () => {};
    for (const item of [...(this.listeners.get(event.type) || [])]) { item.handler(event); if (item.once) this.listeners.set(event.type, this.listeners.get(event.type).filter(value => value !== item)); }
    return true;
  }
  click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); }
  focus() { document.activeElement = this; }
  scrollIntoView() {}
  scrollBy({ left }) { this.scrollLeft += left; this.dispatchEvent({ type: 'scroll' }); }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight }; }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.dispatchEvent({ type: 'close' }); } }
  matches(selector) {
    const attr = [...selector.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
    if (!attr.every(([, key, value]) => this.hasAttribute(key) && (value === undefined || this.getAttribute(key) === value))) return false;
    const clean = selector.replace(/\[[^\]]*\]/g, '');
    if ([...clean.matchAll(/\.([\w-]+)/g)].some(([, name]) => !this.classList.contains(name))) return false;
    const id = clean.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
    const tag = clean.match(/^[\w-]+/)?.[0]; return !tag || this.tagName === tag.toUpperCase();
  }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    const descendants = this.children.flatMap(node => [node, ...node.querySelectorAll('*')]);
    if (selector === '*') return descendants;
    return descendants.filter(node => {
      if (!node.matches(parts.at(-1))) return false;
      let ancestor = node.parentNode;
      for (let index = parts.length - 2; index >= 0; index--) { while (ancestor && !ancestor.matches(parts[index])) ancestor = ancestor.parentNode; if (!ancestor) return false; ancestor = ancestor.parentNode; }
      return true;
    });
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
globalThis.Node = TestNode;
globalThis.document = { body: new TestNode('body'), documentElement: new TestNode('html'), createElement: tag => new TestNode(tag),
  createElementNS: (_, tag) => new TestNode(tag), createTextNode: text => new TestNode('', text), createComment: text => new TestNode('', text) };
globalThis.location = new URL('http://localhost/tools/market-hub-preview.html');
globalThis.history = { state: null, replaceState(state, _, url) { this.state = state; globalThis.location = new URL(url, globalThis.location); } };
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
globalThis.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe() { queueMicrotask(() => { if (!this.dead) this.callback([]); }); } disconnect() { this.dead = true; } };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = callback => queueMicrotask(callback);
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.matchMedia = () => ({ matches: true });

const calls = [];
globalThis.fetch = createFixtureFetch(calls);
const adapter = await import('../assets/js/markethub-data.js');
const fmp = await import('../assets/js/fmp.js');
const { renderMarketHub } = await import('../assets/js/markethub.js');
const { renderMarketIndices } = await import('../assets/js/marketindices.js');
const { renderMarketFutures } = await import('../assets/js/marketfutures.js');
const { calendarStrip, economicCalendar } = await import('../assets/js/markethub-widgets.js');
let count = 0;
const test = async (name, callback) => { await callback(); count++; console.log(`ok ${count} - ${name}`); };
const settle = async (node = document.body) => {
  const deadline = Date.now() + 5000;
  do { await new Promise(resolve => setImmediate(resolve)); if (!node.querySelector('[aria-busy="true"]')) { await new Promise(resolve => setImmediate(resolve)); return; } } while (Date.now() < deadline);
  throw new Error('Hub did not finish its bounded fixture requests');
};
const clickSection = (hub, id) => hub.querySelector(`.mh-navigation [data-section="${id}"]`).click();

await test('quote normalization preserves zero, missing data and provider aliases', () => {
  const zero = adapter.normalizeHubQuote({ symbol: 'NVDA', price: '0', changePercentage: '0', volume: '', marketCap: null });
  assert.equal(zero.price, 0); assert.equal(zero.changesPercentage, 0); assert.equal(zero.volume, null); assert.equal(zero.marketCap, null);
  const old = adapter.normalizeHubQuote({ symbol: 'NVDA', price: '100.5', changesPercentage: '-2.25', mktCap: '12345' });
  assert.equal(old.price, 100.5); assert.equal(old.changesPercentage, -2.25); assert.equal(old.marketCap, 12345);
  assert.equal(adapter.normalizeHubQuote({ symbol: '^GSPC' }).price, null);
});
await test('issuer deduplication prefers US listing and one Alphabet share class', () => {
  const input = [fixtureQuote('NVDA'), { ...fixtureQuote('NVDA.DE'), name: 'NVIDIA Corporation' }, fixtureQuote('GOOG'), fixtureQuote('GOOGL'), fixtureQuote('SPY')];
  const us = adapter.dedupeStocks(input).map(row => row.symbol);
  assert(us.includes('NVDA')); assert(us.includes('GOOGL')); assert(!us.includes('GOOG')); assert(!us.includes('NVDA.DE')); assert(!us.includes('SPY'));
  const world = adapter.dedupeStocks(input, { usOnly: false }).map(row => row.symbol);
  assert(!world.includes('NVDA.DE')); assert(world.includes('NVDA'));
});
await test('yield curve uses latest release, preserves zero and skips absent tenors', () => {
  const curve = adapter.treasuryCurve([{ date: '2026-09-01', month1: 9 }, { date: '2026-09-02', month1: 0, year1: 4.1, year30: null }]);
  assert.deepEqual(curve.map(row => [row.label, row.value]), [['1M', 0], ['1Y', 4.1]]);
});
await test('trailing distribution yield excludes future, expired and duplicate payments', () => {
  const rows = [{ date: '2026-03-01', paymentDate: '2026-03-15', dividend: 1 }, { date: '2026-03-01', paymentDate: '2026-03-15', dividend: 1 },
    { date: '2026-09-01', paymentDate: '2026-10-01', dividend: 10 }, { date: '2025-08-01', dividend: 10 }];
  assert.equal(adapter.trailingDistributionYield(rows, 100, '2026-09-12'), 1);
  assert.equal(adapter.trailingDistributionYield(rows, 0, '2026-09-12'), null);
});
await test('no-key hub renders every section, settings action, and no fabricated prices', async () => {
  const before = calls.length; let settings = 0;
  const hub = renderMarketHub({ openSettings: () => settings++ }); document.body.append(hub);
  for (const spec of adapter.HUB_SECTIONS.filter(spec => spec.id !== 'bonds')) clickSection(hub, spec.id);
  await settle(hub);
  assert.equal(hub.querySelectorAll('.mh-section').length, 7);
  assert.equal(hub.querySelector('#market-bonds'), null);
  assert.equal(hub.querySelector('#market-crypto'), null);
  assert.equal(hub.querySelector('#market-forex'), null);
  assert.equal(calls.length, before); assert(hub.textContent.includes('Connect FMP'));
  assert(hub.querySelectorAll('.mh-price').every(node => node.textContent.startsWith('—')));
  hub.querySelector('.mh-connection').click(); assert.equal(settings, 1);
  // Calendars belong to equities; absent values must not add them to every asset class.
  assert.equal(hub.querySelector('#market-indices').querySelectorAll('.mh-calendar-block').length, 0);
  hub.dispose(); hub.remove();
});
storage.set('mazvantage.fmp.key', FIXTURE_KEY); fmp.clearCache();
await test('dedicated asset pages load only their own section', async () => {
  for (const section of ['futures', 'corporate', 'etfs', 'economy']) {
    const page = renderMarketHub({}, { section }); document.body.append(page); await settle(page);
    assert.equal(page.querySelectorAll('.mh-section').length, 1);
    assert(page.querySelector(`#market-${section}`));
    // The ETFs page's other two tabs are not built until they are asked for.
    assert.equal(page.querySelector('#market-etfs-news'), null);
    assert.equal(page.querySelector('.mh-screener'), null);
    assert(page.querySelector('.mi-title').textContent.length > 0);
    assert.equal(page.querySelector('.mh-picker'), null);
    page.dispose(); page.remove();
  }
});
await test('all live-shaped fixture sections load without foreign duplicate US tickers', async () => {
  const results = await Promise.all(adapter.HUB_SECTIONS.map(spec => adapter.loadHubSection(spec.id)));
  assert(results.every(result => result.status === 'ok'), results.map(result => result.message).join('; '));
  const stocks = results[1].data;
  for (const rows of Object.values(stocks.lists)) assert(!rows.some(row => row.symbol === 'NVDA.DE' || row.symbol === 'GOOG'));
  assert(stocks.earnings.length > 0); assert(stocks.ipos.length > 0);
  const bySection = Object.fromEntries(adapter.HUB_SECTIONS.map((spec, i) => [spec.id, results[i]]));
  assert(bySection.bonds.data.curve.length > 8);
  assert(bySection.economy.data.calendar.every(row => row.country === 'US'));
  assert([...bySection.economy.data.usIndicators.values()].every(entry => entry.latest?.value != null));
  assert(!bySection.world.data.lists.largest.some(row => row.symbol === 'NVDA.DE'));
  assert(!calls.some(path => /batch-(crypto|forex)-quotes/.test(path)));
});
await test('quote tabs switch chart selection by click and keyboard', async () => {
  const hub = renderMarketHub(); document.body.append(hub); await settle(hub);
  const tabs = hub.querySelector('#market-indices').querySelectorAll('[role="tab"]');
  assert(tabs.length > 2); tabs[1].click(); await settle(hub);
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true'); assert.equal(tabs[0].getAttribute('aria-selected'), 'false');
  assert(hub.querySelector('.mhc__title').textContent.includes(tabs[1].dataset.symbol));
  tabs[1].dispatchEvent({ type: 'keydown', key: 'ArrowRight' }); await settle(hub);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true'); assert.equal(document.activeElement, tabs[2]);
  assert.equal(tabs.filter(node => node.getAttribute('aria-selected') === 'true').length, 1);
  hub.dispose(); hub.remove();
});
await test('ranking modal filters instruments and disposal closes the dialog', async () => {
  const hub = renderMarketHub(); document.body.append(hub); clickSection(hub, 'stocks'); await settle(hub);
  hub.querySelector('#market-stocks').querySelector('.mh-see-all').click();
  const dialog = document.body.querySelector('dialog'); assert(dialog?.open);
  const search = dialog.querySelector('input'); search.value = 'NVDA'; search.dispatchEvent({ type: 'input' });
  assert.equal(dialog.querySelectorAll('.mh-row').length, 1); assert(dialog.querySelector('.mh-row').textContent.includes('NVDA'));
  search.value = 'no such company'; search.dispatchEvent({ type: 'input' }); assert.equal(dialog.querySelectorAll('.mh-row').length, 0);
  hub.dispose(); assert.equal(document.body.querySelector('dialog'), null); hub.remove();
});
await test('a country outside the US adapts what FMP covers and states what it does not', async () => {
  const before = calls.length;
  const [indices, stocks, bonds, economy, etfs] = await Promise.all(['indices', 'stocks', 'bonds', 'economy', 'etfs']
    .map(id => adapter.loadHubSection(id, { country: 'DE' })));
  // Indices: the country's own benchmarks locally, everyone else's in the rail.
  assert(indices.data.quotes.some(row => row.symbol === '^GDAXI'));
  assert(!indices.data.quotes.some(row => row.symbol === '^GSPC'));
  assert(indices.data.worldIndices.some(row => row.symbol === '^GSPC'));
  // Stocks: ranked from the country screener, since the mover feeds are US-only.
  assert(stocks.data.lists.volume.length > 0);
  for (const rows of Object.values(stocks.data.lists)) assert(rows.every(row => row.symbol.endsWith('.DE')));
  assert(stocks.data.quotes.every(row => row.symbol.endsWith('.DE')));
  assert(stocks.data.earnings.every(row => row.symbol.endsWith('.DE')));
  assert.equal(stocks.data.ipos.length, 0);
  assert(stocks.notes.join(' ').includes('US exchanges only'));
  assert(!calls.slice(before).some(path => path.includes('biggest-gainers') || path.includes('most-active')));
  // The three US-only feeds are named as gaps rather than filled with US values.
  assert.equal(bonds.data.curve.length, 0);
  assert(bonds.data.unavailable.includes('Germany'));
  assert(!calls.slice(before).some(path => path.includes('treasury-rates')));
  // The indicator series are US and stay US: the board carries them under its
  // own United States heading rather than hiding them behind another flag.
  // (and are cached across countries, so this load may not re-request them).
  assert(economy.data.usIndicators.size > 0);
  assert([...economy.data.usIndicators.values()].some(entry => entry.status === 'ok'));
  assert(etfs.data.quotes.every(row => row.symbol.endsWith('.DE')));
});
await test('economic releases follow the country, and the US sections keep their own data', async () => {
  const [uk, us] = await Promise.all([adapter.loadHubSection('economy', { country: 'GB' }), adapter.loadHubSection('economy')]);
  assert(uk.data.calendar.length > 0);
  assert(uk.data.calendar.every(row => row.country === 'GB'));
  assert(us.data.calendar.every(row => row.country === 'US'));
  // The indicator series are US whichever country is picked, and both get them.
  assert(us.data.usIndicators.size > 0);
  assert.equal(uk.data.usIndicators.size, us.data.usIndicators.size);
  const empty = await adapter.loadHubSection('etfs', { country: 'FR' });
  assert.equal(empty.data.lists.volume, undefined);
  assert.equal(empty.data.listStatus.volume.status, 'unavailable');
  assert(empty.data.listStatus.volume.message.includes('France'));
});
await test('the title picker switches country and rebuilds every section', async () => {
  const hub = renderMarketHub(); document.body.append(hub); await settle(hub);
  assert(hub.querySelector('.mh-picker h1').textContent.includes('World'));
  assert.equal(hub.querySelector('[data-section="stocks"]').textContent, 'US stocks');
  assert.equal(hub.querySelector('#market-indices h2').textContent.includes('World indices'), true);
  const items = hub.querySelectorAll('.mh-picker__item');
  assert.equal(items.length, adapter.COUNTRIES.length+1);
  // Sections whose data does not travel say so, whichever country is chosen.
  assert.equal(hub.querySelector('#market-world').querySelector('.mh-scope').textContent, 'Global');
  assert.equal(hub.querySelector('#market-corporate').querySelector('.mh-scope'), null);
  items.find(node => node.textContent.includes('Germany')).click();
  await settle(hub);
  assert(hub.querySelector('.mh-picker h1').textContent.includes('Germany'));
  assert.equal(hub.querySelector('[data-section="stocks"]').textContent, 'Germany stocks');
  assert(hub.querySelector('#market-indices h2').textContent.includes('Germany indices'));
  assert(hub.querySelector('#market-indices').textContent.includes('DAX'));
  assert(!hub.querySelector('#market-indices').textContent.includes('S&P 500 ·'));
  assert.equal(hub.querySelector('#market-corporate').querySelector('.mh-scope').textContent, 'United States');
  assert.equal(localStorage.getItem('mazvantage.market.country'), 'DE');
  assert.equal(new URL(globalThis.location.href).searchParams.get('country'), 'DE');
  hub.dispose(); hub.remove();
  storage.delete('mazvantage.market.country');
  globalThis.location = new URL('http://localhost/tools/market-hub-preview.html');
});
await test('the index board places what it can and keeps the rest under all indices', async () => {
  const board = await adapter.loadIndexBoard();
  assert.equal(board.status, 'ok');
  const bySymbol = new Map(board.data.rows.map(row => [row.symbol, row]));
  assert.equal(bySymbol.get('^GSPC').region, 'americas');
  assert.equal(bySymbol.get('^FTSE').region, 'europe');
  assert.equal(bySymbol.get('FTSEMIB.MI').region, 'europe');
  assert.equal(bySymbol.get('^N225').region, 'asia');
  assert.equal(bySymbol.get('^AXJO').region, 'pacific');
  assert.equal(bySymbol.get('^TASI').region, 'middle-east');
  assert.equal(bySymbol.get('^JN0U.JO').region, 'africa');
  // An index this page cannot place is still listed, just not filed by region.
  assert.equal(bySymbol.get('^UNPLACED').region, null);
  assert(board.data.rows.filter(row => row.primary).length > 5);
  assert(board.data.sectors.length > 0);
  assert(board.data.sectors.every(row => row.price === null));
});
await test('index performance carries every window the price-change feed returns', async () => {
  const performance = await adapter.loadPriceChanges(['^GSPC']);
  const entry = performance.get('^GSPC');
  assert.equal(entry.status, 'ok');
  for (const column of adapter.PRICE_CHANGE_COLUMNS) assert.equal(typeof entry.values[column.key], 'number');
});
await test('Market Indices opens on the summary and every board is a sortable table', async () => {
  const visited = [];
  const page = renderMarketIndices({ goView: (view, sub) => visited.push(`${view}/${sub}`) });
  document.body.append(page);
  await settle(page);
  assert.equal(page.querySelector('.mi-title').textContent, 'Market Indices');
  const tabs = page.querySelectorAll('.mh-navigation [data-board]');
  assert.equal(tabs.length, adapter.INDEX_BOARDS.length + 2);  // the boards, plus Overview and News
  assert.equal(tabs[0].getAttribute('data-board'), 'overview');
  assert.equal(tabs[0].className, 'is-active');
  // The summary compares the six marked US indices; volatility is not one.
  assert.equal(page.querySelectorAll('.mcc__chip').length, 6);
  assert(!page.querySelector('.mi-summary').textContent.includes('Volatility'));
  assert(page.querySelector('.mi-quotes').textContent.includes('S&P 500'));
  page.querySelector('.mi-crumb').click();
  assert.deepEqual(visited, ['markets/overview']);
  page.querySelector('[data-board="europe"]').click();
  await settle(page);
  assert.equal(page.querySelectorAll('.mi-filter').length, 2);
  const first = page.querySelectorAll('.mi-table tbody tr');
  assert(first.length > 1);
  assert(page.querySelector('.mi-table').textContent.includes('FTSE 100'));
  assert(!page.querySelector('.mi-table').textContent.includes('S&P 500'));
  // Every header sorts, and the direction flips on a second press.
  const header = page.querySelectorAll('.mi-table thead th button');
  header[1].click();
  const prices = () => page.querySelectorAll('.mi-table tbody tr').map(row => Number(row.children[1].textContent.replace(/[^0-9.]/g, '')));
  const descending = prices();
  assert.deepEqual(descending, [...descending].sort((a, b) => b - a));
  page.querySelectorAll('.mi-table thead th button')[1].click();
  const ascending = prices();
  assert.deepEqual(ascending, [...ascending].sort((a, b) => a - b));
  // Performance is a bought column: it says what it costs before spending it.
  const before = calls.length;
  page.querySelectorAll('.mi-filter')[1].click();
  assert(page.querySelector('.mi-consent').textContent.includes('one request'));
  assert.equal(calls.length, before);
  page.querySelector('.mi-load').click();
  await settle(page);
  assert.equal(page.querySelector('.mi-consent'), null);
  assert(calls.slice(before).some(path => path.includes('stock-price-change')));
  assert(page.querySelector('.mi-table thead').textContent.includes('YTD'));
  page.dispose(); page.remove();
  // The board travels in the URL, so the next page must not inherit this one.
  globalThis.location = new URL('http://localhost/tools/market-hub-preview.html');
});
await test('index news keeps the stories that name an index and marks them with it', async () => {
  const news = await adapter.loadIndexNews();
  assert.equal(news.status, 'ok');
  const titles = news.data.articles.map(article => article.title);
  assert(titles.some(title => title.includes('Sensex')));
  assert(titles.some(title => title.includes('Hang Seng')));
  // A market story that names no index is not index news.
  assert(!titles.some(title => title.includes('Apple supplier')));
  assert(!titles.some(title => title.includes('Crude oil')));
  assert(!titles.some(title => title.includes('square one')));
  assert(news.data.articles.every(article => article.indices.length > 0 && article.indices.length <= 4));
  const sensex = news.data.articles.find(article => article.title.includes('Sensex'));
  assert.deepEqual(sensex.indices.map(row => row.symbol).sort(), ['^BSESN', '^NSEI']);
  // Newest first, and the scan size is stated rather than implied.
  const dates = news.data.articles.map(article => article.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert(news.data.scanned > news.data.articles.length);
  assert(news.notes.join(' ').includes('never by index'));
});
await test('the overview carries a news section and Keep reading opens the News tab', async () => {
  const page = renderMarketIndices({});
  document.body.append(page);
  await settle(page);
  // The summary is drawn before the news feed is asked for, then filled in.
  const deadline = Date.now() + 3000;
  while (!page.querySelector('.mi-news') && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
  const cards = page.querySelectorAll('.mi-news');
  assert(cards.length > 0 && cards.length <= 9);
  assert(page.querySelector('.mi-news__title').textContent.length > 10);
  assert(page.querySelector('.mi-news__marks .mh-mark'));
  const tabs = page.querySelectorAll('.mh-navigation [data-board]');
  assert.equal(tabs.at(-1).getAttribute('data-board'), 'news');
  page.querySelector('.mi-keep').click();
  await settle(page);
  assert.equal(page.querySelector('[data-board="news"]').className, 'is-active');
  assert(page.querySelectorAll('.mi-news').length >= cards.length);
  assert.equal(page.querySelector('.mi-keep'), null);
  assert(page.textContent.includes('Market Indices news'));
  page.dispose(); page.remove();
});
await test('world rates read the vendor\'s own release rows and reject what is not that rate', async () => {
  const { economyRates } = await import('../assets/js/economy-data.js');
  const now = new Date('2026-09-14T12:00:00Z');
  const at = days => new Date(+now - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const maps = economyRates([
    { date: at(3), country: 'UK', event: 'Inflation Rate YoY (Aug)', actual: 2.9, unit: '%' },
    { date: at(40), country: 'UK', event: 'Inflation Rate YoY (Jul)', actual: 3.5, unit: '%' },
    { date: at(8), country: 'US', event: 'Inflation Rate YoY (Aug)', actual: 3.4, unit: '%' },
    { date: at(7), country: 'US', event: 'Core Inflation Rate YoY (Aug)', actual: 2.4, unit: '%' },
    { date: at(6), country: 'US', event: 'Inflation Rate MoM (Aug)', actual: 0.4, unit: '%' },
    { date: at(5), country: 'US', event: 'CPI (Aug)', actual: 334.98, unit: '%' },
    { date: at(4), country: 'PT', event: 'Inflation Rate YoY (Aug)', actual: 108.4, unit: 'Points' },
    { date: at(9), country: 'DE', event: 'GDP Growth Rate YoY (Q2)', actual: 1, unit: '%' },
    { date: at(9), country: 'DE', event: 'GDP Growth Rate QoQ (Q2)', actual: 0.3, unit: '%' },
    { date: at(4), country: 'JP', event: 'GDP Growth Annualized (Q2)', actual: 2.2, unit: '%' },
    { date: at(200), country: 'FR', event: 'Inflation Rate YoY (Feb)', actual: 1.2, unit: '%' },
    { date: at(-2), country: 'ES', event: 'Inflation Rate YoY (Sep)', actual: 2.1, unit: '%' },
    { date: at(4), country: 'EU', event: 'Inflation Rate YoY (Aug)', actual: 2.2, unit: '%' },
    { date: at(4), country: 'IT', event: 'Inflation Rate YoY (Aug)', actual: null, unit: '%' },
  ], now);
  // `UK` is the vendor's spelling, and the newest print of the same rate wins.
  assert.equal(maps.inflation.GB.value, 2.9);
  assert.equal(maps.inflation.US.value, 3.4);
  assert.equal(maps.gdp.DE.value, 1);
  assert.equal(maps.gdpQuarterly.DE.value, 0.3);
  assert.equal(maps.gdpAnnualized.JP.value, 2.2);
  // Core rates, monthly rates, index levels, a bloc, a scheduled row with no
  // actual and anything older than the window are all somebody else's number.
  assert.deepEqual(Object.keys(maps.inflation).sort(), ['GB', 'US']);
  for (const absent of ['FR', 'ES', 'EU', 'IT', 'PT']) assert.equal(maps.inflation[absent], undefined);
});
await test('a refused history window is retried in slices rather than blanking the maps', async () => {
  const real = globalThis.fetch;
  let refused = 0, sliced = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('economic-calendar') && url.searchParams.get('from')) {
      const span = (Date.parse(url.searchParams.get('to')) - Date.parse(url.searchParams.get('from'))) / 86400000;
      if (span > 40) {
        refused++;
        return new Response(JSON.stringify({ 'Error Message': 'The requested date range is too large.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (span > 2) sliced++;
    }
    return real(input, init);
  };
  fmp.clearCache();
  const economy = await adapter.loadHubSection('economy', { refresh: true });
  globalThis.fetch = real;
  fmp.clearCache();
  assert.equal(refused, 2);
  assert(sliced >= 6, `expected the refused windows to be retried in slices, saw ${sliced}`);
  assert(Object.keys(economy.data.worldRates.inflation).length > 10);
  assert.equal(economy.data.mapStatus.status, 'ok');
});
await test('the economy page draws both world maps from the release history', async () => {
  const page = renderMarketHub({}, { section: 'economy' });
  document.body.append(page);
  await settle(page);
  // The URL is `/stable/economic-calendar`; the plural is the docs slug and a 404.
  assert(calls.some(path => path.startsWith('/stable/economic-calendar')), 'the release calendar was never requested');
  assert(!calls.some(path => path.includes('economics-calendar')), 'economics-calendar is the documentation slug, not the endpoint');
  const counts = page.querySelectorAll('.em-count').map(node => node.textContent);
  assert.equal(counts.length, 2);
  assert(counts.every(text => Number(text.replace(/\D+/g, '')) > 10), counts.join(' / '));
  // Nothing to explain away when the history loaded.
  assert(page.querySelectorAll('.em-notice').every(node => node.hasAttribute('hidden')));
  assert(page.querySelector('.em-table').textContent.includes('%'));
  page.dispose(); page.remove();
});
await test('the US indicator board loads its headline series and can fetch every other one', async () => {
  const economy = await adapter.loadHubSection('economy');
  const headline = adapter.US_INDICATORS.filter(item => item.headline);
  assert.equal(economy.data.usIndicators.size, headline.length);
  // Three windows for a quarterly series, one for a weekly one: enough of each
  // to print a move against the observation before it.
  const gdp = economy.data.usIndicators.get('realGDP');
  assert.equal(gdp.status, 'ok');
  assert(gdp.points.length >= 2, `real GDP had ${gdp.points.length} observations`);
  assert(gdp.previous && gdp.latest.date > gdp.previous.date);
  const claims = economy.data.usIndicators.get('initialClaims');
  assert(claims.points.length > 4);
  assert(economy.notes.join(' ').includes('United States'));
  const rest = adapter.US_INDICATORS.filter(item => !item.headline).map(item => item.name);
  const more = await adapter.loadUsIndicators(rest);
  assert.equal(more.size, rest.length);
  assert([...more.values()].every(entry => entry.status === 'ok' && entry.latest),
    [...more.values()].filter(entry => entry.status !== 'ok').map(entry => entry.name).join(', '));
});
await test('the economy page prints the US board in its own units and says what the rest costs', async () => {
  const page = renderMarketHub({}, { section: 'economy' });
  document.body.append(page);
  await settle(page);
  const board = page.querySelector('.em-us');
  assert(board.textContent.includes('United States'));
  assert(board.textContent.includes('US series only'));
  const headline = adapter.US_INDICATORS.filter(item => item.headline);
  assert.equal(board.querySelectorAll('.mhw-indicator').length, headline.length);
  const gdpCard = board.querySelectorAll('.mhw-indicator').find(node => node.textContent.includes('Real GDP'));
  assert(gdpCard.querySelector('.mhw-indicator__value').textContent.startsWith('$'));
  assert(gdpCard.querySelector('.mhw-indicator__change').textContent.includes('since'));
  const claimsCard = board.querySelectorAll('.mhw-indicator').find(node => node.textContent.includes('Initial jobless'));
  assert(/^\d{3},\d{3}$/.test(claimsCard.querySelector('.mhw-indicator__value').textContent));
  // The other series wait behind their cost.
  assert(board.querySelector('.em-consent').textContent.includes('more series are not loaded'));
  board.querySelector('.em-load').click();
  const deadline = Date.now() + 5000;
  while (board.querySelector('.em-consent') && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
  assert.equal(board.querySelectorAll('.mhw-indicator').length, adapter.US_INDICATORS.length);
  assert.equal(board.querySelector('.em-consent'), null);
  page.dispose(); page.remove();
});
await test('the indicator chart opens on history already bought and prices every longer range', async () => {
  const page = renderMarketHub({}, { section: 'economy' });
  document.body.append(page);
  await settle(page);
  const block = page.querySelector('#economy-chart');
  const tabs = block.querySelectorAll('.emc-tab');
  assert.equal(tabs.length, adapter.US_INDICATORS.filter(item => item.headline).length);
  assert(tabs[0].textContent.includes('US Real GDP'));
  // Nine months is the three windows the board already paid for; arriving at
  // the section spends nothing beyond them.
  const active = () => block.querySelectorAll('.mhc__range').find(node => node.classList.contains('is-active')).textContent;
  assert.equal(active(), '9M');
  assert(block.querySelector('.mhc__detail').textContent.includes('observations'));
  const indicatorCalls = () => calls.filter(path => path.includes('economic-indicators')).length;

  // Switching series is a redraw, not a purchase.
  const before = indicatorCalls();
  tabs.find(node => node.textContent.includes('Inflation')).click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(indicatorCalls(), before);
  assert.equal(active(), '6M');
  const monthly = block.querySelector('.mhc__detail').textContent;
  assert(monthly.includes('6 observations'), monthly);

  // A longer range says what it costs, and costs exactly that.
  const year = block.querySelectorAll('.mhc__range').find(node => node.textContent === '1Y');
  assert.equal(year.title, '1 year · 3 FMP requests more');
  year.click();
  const chart = block.querySelector('.emc');
  const deadline = Date.now() + 5000;
  while (chart.getAttribute('aria-busy') && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
  assert.equal(indicatorCalls(), before + 3);
  assert.equal(active(), '1Y');
  assert(block.querySelector('.mhc__detail').textContent.includes('12 observations'));
  assert.equal(year.title, '1 year · already loaded');
  // Stepping back down redraws from what was bought rather than buying again.
  block.querySelectorAll('.mhc__range').find(node => node.textContent === '3M').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(indicatorCalls(), before + 3);

  // Ten years is offered, and offered with its arithmetic attached.
  assert(block.querySelectorAll('.mhc__range').find(node => node.textContent === '10Y').title.includes('FMP requests'));
  assert(block.querySelector('.emc-block__note').textContent.includes('41 FMP requests'));

  // Expanding moves the chart into a dialog and closing puts it back.
  const expand = block.querySelectorAll('.mhc__tool').at(-1);
  expand.click();
  assert(document.body.querySelector('.mhc-modal .emc'), 'the chart did not move into the dialog');
  expand.click();
  assert(page.querySelector('#economy-chart .emc'), 'the chart did not return to the section');
  assert.equal(document.body.querySelector('.mhc-modal'), null);
  page.dispose(); page.remove();
});
await test('economic releases read as cards, with the full table behind them', async () => {
  const page = renderMarketHub({}, { section: 'economy' });
  document.body.append(page);
  await settle(page);
  const cards = page.querySelectorAll('.mhw-release');
  assert(cards.length > 0 && cards.length <= 18, `${cards.length} release cards`);
  const first = cards[0];
  assert.deepEqual(first.querySelectorAll('dt').map(node => node.textContent), ['Actual', 'Forecast', 'Prior']);
  // A release with no actual yet says so rather than borrowing its forecast.
  const upcoming = cards.find(card => card.querySelector('.is-actual') == null);
  if (upcoming) assert.equal(upcoming.querySelectorAll('dd')[0].textContent, '—');
  assert(first.querySelector('.mhw-impact'), 'the card dropped the importance mark');
  assert(first.querySelector('.mhw-release__flag').textContent.length > 0);
  // The page that exists for the calendar keeps the whole table under the strip.
  assert(page.querySelector('.mhw-events'), 'the world page lost its release table');
  page.dispose(); page.remove();

  // Everywhere else the table is one click away and the strip is what shows.
  const hub = renderMarketHub({});
  document.body.append(hub);
  clickSection(hub, 'economy');
  await settle(hub);
  assert(hub.querySelectorAll('.mhw-release').length > 0);
  assert.equal(hub.querySelector('.mhw-events'), null);
  hub.querySelectorAll('.mh-calendar-block .mhw-see-all').at(-1).click();
  const dialog = document.body.querySelectorAll('.mh-dialog').at(-1);
  assert(dialog.querySelector('.mhw-events'), 'See all did not open the release table');
  assert(dialog.querySelectorAll('.mhw-events tbody tr').length > 0);
  hub.dispose(); hub.remove();
});
await test('the futures board groups every contract FMP lists and leaves the rest under all', async () => {
  const board = await adapter.loadFuturesBoard();
  assert.equal(board.status, 'ok');
  const bySymbol = new Map(board.data.rows.map(row => [row.symbol, row]));
  assert.equal(bySymbol.get('GCUSD').group, 'metals');
  assert.equal(bySymbol.get('CLUSD').group, 'energy');
  assert.equal(bySymbol.get('ZCUSX').group, 'agricultural');
  assert.equal(bySymbol.get('ZNUSD').group, 'rates');
  assert.equal(bySymbol.get('ESUSD').group, 'indices');
  assert.equal(bySymbol.get('DXUSD').group, 'currencies');
  // A contract the grouping table does not know is listed, not filed.
  assert.equal(bySymbol.get('XXUSD').group, null);
  // The list feed supplies the delivery month and the contract currency.
  assert(bySymbol.get('ZCUSX').tradeMonth);
  assert.equal(bySymbol.get('ZCUSX').currency, 'USX');
  assert(board.notes.join(' ').includes('All futures'));
});
await test('Futures opens on its summary and every collection is a table', async () => {
  // A board remembers its tab in the URL, so a page opened after another one
  // starts from a clean address rather than inheriting `&board=`.
  globalThis.location = new URL('http://localhost/tools/market-hub-preview.html');
  const page = renderMarketFutures({});
  document.body.append(page);
  await settle(page);
  assert.equal(page.querySelector('.mi-title').textContent, 'Futures');
  const tabs = page.querySelectorAll('.mh-navigation [data-board]').map(node => node.textContent);
  assert.deepEqual(tabs, ['Overview', 'All futures', 'Agricultural', 'Energy', 'Currencies', 'Metals', 'World indices', 'Interest rates', 'News']);
  // The summary compares the six a futures board opens on.
  assert.equal(page.querySelectorAll('.mcc__chip').length, 6);
  assert(page.querySelector('.mi-quotes').textContent.includes('Gold'));
  assert(page.querySelector('.mh-world-card'));
  // News sits under the contracts rail, and Keep reading opens the tab.
  const deadline = Date.now() + 4000;
  while (!page.querySelector('.mi-news') && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
  assert(page.querySelectorAll('.mi-news').length > 0);
  assert(page.querySelector('.mi-news__marks .mh-mark'));
  const sections = page.querySelectorAll('.mi-section').map(node => node.textContent.slice(0, 40));
  assert(sections.length >= 3 && sections[1].includes('Other contracts') && sections[2].includes('News'), sections.join(' / '));
  page.querySelector('.mi-keep').click();
  await settle(page);
  assert.equal(page.querySelector('[data-board="news"]').className, 'is-active');
  assert(page.textContent.includes('Futures news'));
  page.querySelector('[data-board="metals"]').click();
  await settle(page);
  const table = page.querySelector('.mi-table');
  assert(table.textContent.includes('Gold'));
  assert(!table.textContent.includes('Natural gas'));
  assert(page.querySelector('.mi-table thead').textContent.includes('Delivery'));
  assert.equal(page.querySelectorAll('.mi-filter').length, 2);
  page.querySelectorAll('.mi-filter')[1].click();
  assert(page.querySelector('.mi-consent').textContent.includes('contracts'));
  page.querySelector('.mi-load').click();
  await settle(page);
  assert(page.querySelector('.mi-table thead').textContent.includes('YTD'));
  page.dispose(); page.remove();
  globalThis.location = new URL('http://localhost/tools/market-hub-preview.html');
});
await test('futures news keeps the stories that name a contract, and Goldman is not gold', async () => {
  const news = await adapter.loadFuturesNews();
  assert.equal(news.status, 'ok');
  const titles = news.data.articles.map(article => article.title);
  assert(titles.some(title => title.includes('Gold steadies')));
  assert(titles.some(title => title.includes('Copper and aluminium')));
  assert(titles.some(title => title.includes('WTI crude')));
  // A word that merely contains a contract's name is not that contract.
  assert(!titles.some(title => title.includes('Goldman Sachs')));
  // Nor is an index story a futures story.
  assert(!titles.some(title => title.includes('Sensex')));
  const metals = news.data.articles.find(article => article.title.includes('Copper and aluminium'));
  assert.deepEqual(metals.indices.map(row => row.symbol).sort(), ['ALIUSD', 'HGUSD']);
  const crude = news.data.articles.find(article => article.title.includes('WTI crude'));
  assert.deepEqual(crude.indices.map(row => row.symbol).sort(), ['BZUSD', 'CLUSD']);
  assert(news.notes.join(' ').includes('never by contract'));
  // The index board keeps its own subject matter.
  const indices = await adapter.loadIndexNews();
  assert(indices.data.articles.every(article => !article.title.includes('Copper and aluminium')));
});
await test('calendar widgets preserve zero actual/estimate and unavailable fields', () => {
  const earnings = calendarStrip([{ symbol: 'TEST', name: 'UI test', date: '2026-09-12', epsEstimated: 0, epsActual: null }]);
  assert(earnings.textContent.includes('0.00')); assert(earnings.textContent.includes('—'));
  const releases = economicCalendar([{ date: '2026-09-12 08:30:00', country: 'US', event: 'Test release', actual: 0, estimate: null, previous: 1 }]);
  assert.equal(releases.querySelector('.mhw-events__actual').textContent, '0');
});
await test('stocks share a country page and collections preserve country in screener navigation', async () => {
  const { renderStockMarkets, stockScreenParams, renderStockScreener } = await import('../assets/js/stockmarkets.js');
  assert.equal(stockScreenParams('FR','tech').country,'FR');
  assert.equal(stockScreenParams('FR','tech').sector,'Technology');
  assert.equal(stockScreenParams('WORLD','large').country,undefined);
  assert.equal(stockScreenParams('US','large').marketCapMoreThan,10e9);
  globalThis.location=new URL('http://localhost/?view=markets&sub=stocks&country=FR');
  const visits=[];
  const page=renderStockMarkets({goView:(...args)=>visits.push(args)});
  document.body.append(page);
  const deadline=Date.now()+5000;
  while(!page.querySelector('.ms-collection')&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  assert(page.querySelector('.ms-collection'),page.textContent);
  assert(page.textContent.includes('France stocks news'));
  const newsDeadline=Date.now()+3000;
  while(!page.querySelector('.ms-story')&&Date.now()<newsDeadline)await new Promise(resolve=>setImmediate(resolve));
  assert(page.querySelector('.ms-story'),page.textContent);
  assert(!page.textContent.includes('Community ideas'));
  page.querySelectorAll('.ms-collection')[1].click();
  assert.deepEqual(visits.pop(),['stocks','screener',{country:'FR',collection:'large'}]);
  page.dispose();page.remove();
  globalThis.location=new URL('http://localhost/?view=stocks&sub=screener&country=FR&collection=tech');
  const screen=renderStockScreener({});document.body.append(screen);
  const end=Date.now()+5000;
  while(!screen.querySelector('.mtwrap')&&Date.now()<end)await new Promise(resolve=>setImmediate(resolve));
  assert(screen.querySelector('.mtwrap'),screen.textContent);
  assert.equal(screen.querySelector('.ms-country').value,'FR');
  screen.dispose();screen.remove();
});
await test('sector performance excludes missing changes and sector navigation preserves country', async()=>{
  const {aggregatePerformance,renderStockMarkets}=await import('../assets/js/stockmarkets.js');
  const groups=aggregatePerformance([{sector:'Tech',changesPercentage:0},{sector:'Tech',changesPercentage:4},{sector:'Tech',changesPercentage:null},{sector:'Energy',changesPercentage:-3}],'sector');
  assert.equal(groups[0].change,2);assert.equal(groups[0].count,2);assert.equal(groups[1].change,-3);
  globalThis.location=new URL('http://localhost/?view=markets&sub=stocks&country=FR&board=sectors');
  const page=renderStockMarkets({});document.body.append(page);
  const end=Date.now()+3000;
  while(!page.querySelector('.mtwrap')&&Date.now()<end)await new Promise(resolve=>setImmediate(resolve));
  assert(page.querySelector('.mtwrap'),page.textContent);
  assert.deepEqual(page.querySelectorAll('.ms-screen-tabs button').map(n=>n.textContent),['Overview','Performance','Technicals','Valuation','Dividends','Profitability','Income statement','Balance sheet','Cash flow']);
  assert(page.textContent.includes('Industries'));
  assert.equal(page.querySelector('.ms-country').value,'FR');
  page.dispose();page.remove();
});
await test('screener supplies all requested column views and statement fields',async()=>{
  const {SCREENER_COLUMN_SETS}=await import('../assets/js/markettable.js');
  assert.deepEqual(SCREENER_COLUMN_SETS.map(s=>s.label),['Overview','Performance','Technicals','Valuation','Dividends','Profitability','Income statement','Balance sheet','Cash flow']);
  const income=SCREENER_COLUMN_SETS.find(s=>s.key==='income');
  assert.equal(income.columns.find(c=>c.key==='revenue').get({bags:{income:{revenue:123}}}),123);
});
await test('dedicated screener defaults, asset routing, search and column switching',async()=>{
  const {renderDedicatedScreener,screenerParams}=await import('../assets/js/screener.js');
  const {defaultSub}=await import('../assets/js/nav.js');
  assert.equal(defaultSub('stocks'),'screener');
  assert.equal(screenerParams('FR','etfs').isEtf,true);
  assert.equal(screenerParams('FR','etfs').isFund,undefined);
  assert.equal(screenerParams('WORLD','stocks').country,undefined);
  assert.equal(screenerParams('US','stocks','tech').sector,'Technology');
  globalThis.location=new URL('http://localhost/?view=stocks&sub=screener&country=US');
  const visits=[],screen=renderDedicatedScreener({goView:(...args)=>visits.push(args)});
  document.body.append(screen);
  const deadline=Date.now()+5000;
  while(!screen.querySelector('tbody')&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  assert(screen.querySelector('tbody'),screen.textContent);
  assert.equal(screen.querySelectorAll('[role="tab"]').length,9);
  const search=screen.querySelector('input[type="search"]');search.value='no-such-symbol-123';search.dispatchEvent({type:'input'});
  assert(screen.textContent.includes('No matches.'));
  search.value='';search.dispatchEvent({type:'input'});
  screen.querySelectorAll('[role="tab"]')[2].click();
  assert(screen.textContent.includes('50-day average'));
  const country=screen.querySelector('[aria-label="Country"]');country.value='FR';country.dispatchEvent({type:'change'});
  assert.deepEqual(visits.pop(),['stocks','screener',{country:'FR',kind:'stocks',collection:'all'}]);
  const type=screen.querySelector('.sc-type');type.value='etfs';type.dispatchEvent({type:'change'});
  assert.deepEqual(visits.pop(),['stocks','screener',{country:'US',kind:'etfs',collection:'all'}]);
  screen.dispose();screen.remove();
  globalThis.location=new URL('http://localhost/?view=stocks&sub=screener&country=US&kind=etfs');
  const funds=renderDedicatedScreener({});document.body.append(funds);
  const end=Date.now()+5000;
  while(!funds.querySelector('tbody')&&Date.now()<end)await new Promise(resolve=>setImmediate(resolve));
  assert(funds.querySelector('tbody tr'),'ETF rows must not pass through common-stock exclusion');
  assert.equal(funds.querySelectorAll('[role="tab"]').length,3);
  assert(!funds.querySelector('[aria-label="Sector"]'));
  funds.dispose();funds.remove();
});
await test('ETF collections select on numbers and on names, and every one can be picked',async()=>{
  const {ETF_COLLECTIONS,etfCollection}=await import('../assets/js/etf-collections.js');
  assert.equal(new Set(ETF_COLLECTIONS.map(item=>item.id)).size,ETF_COLLECTIONS.length);
  assert.equal(new Set(ETF_COLLECTIONS.map(item=>item.title)).size,ETF_COLLECTIONS.length);
  // Every entry selects rows: the dropdown lists nothing a reader cannot pick.
  assert(ETF_COLLECTIONS.every(item=>item.id==='all'||item.test));
  assert(ETF_COLLECTIONS.every(item=>!item.unavailable));
  assert.deepEqual([...new Set(ETF_COLLECTIONS.map(item=>item.group))],['Market Collections','What the fund holds']);
  // An id the list no longer carries opens the whole market, not an empty page.
  assert.equal(etfCollection('no-such-collection').id,'all');
  assert.equal(etfCollection('largest-inflows').id,'all');
  const fund=(symbol,name,extra={})=>({symbol,name,companyName:name,price:100,...extra});
  const keeps=(id,...rows)=>rows.filter(row=>etfCollection(id).test(row)).map(row=>row.symbol);
  // The two traps: Goldman is not gold, and a short-term bond fund is not an
  // inverse fund.
  assert.deepEqual(keeps('gold',fund('GLD','SPDR Gold Shares'),fund('GS','Goldman Sachs ETF')),['GLD']);
  assert.deepEqual(keeps('inverse',fund('SQQQ','ProShares UltraPro Short QQQ'),fund('SJNK','SPDR Short Term High Yield Bond')),['SQQQ']);
  // A fund that is both is inverse: the direction is the more useful fact.
  assert.deepEqual(keeps('leveraged',fund('TQQQ','ProShares UltraPro QQQ 3x Shares'),fund('SQQQ','ProShares UltraPro Short QQQ')),['TQQQ']);
  assert.deepEqual(keeps('bond',fund('TLT','iShares 20+ Year Treasury Bond ETF'),fund('SPY','SPDR S&P 500 ETF Trust')),['TLT']);
  assert.deepEqual(keeps('bitcoin',fund('IBIT','iShares Bitcoin Trust'),fund('SPY','SPDR S&P 500 ETF Trust')),['IBIT']);
  assert.deepEqual(keeps('sector',fund('XLE','Energy Select Sector SPDR Fund'),fund('VTI','Vanguard Total Stock Market ETF')),['XLE']);
  // Numbers, not names, and the collection opens on the column it ranks.
  assert.equal(etfCollection('highest-yield').sort.key,'divYield');
  assert.deepEqual(keeps('highest-yield',fund('SCHD','Schwab US Dividend Equity ETF',{lastAnnualDividend:2.4}),fund('NOPAY','No distribution fund',{lastAnnualDividend:0})),['SCHD']);
  assert.deepEqual(keeps('negative-beta',fund('A','a',{beta:-0.4}),fund('B','b',{beta:0.4})),['A']);
  assert.equal(etfCollection('lowest-beta').sort.direction,1);
});
await test('the ETF screener opens on its collection and prints the rule it selected on',async()=>{
  const {renderDedicatedScreener}=await import('../assets/js/screener.js');
  globalThis.location=new URL('http://localhost/?view=stocks&sub=screener&country=US&kind=etfs&collection=bond');
  const funds=renderDedicatedScreener({});document.body.append(funds);
  const deadline=Date.now()+5000;
  while(!funds.querySelector('tbody tr')&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  const groups=funds.querySelectorAll('optgroup').map(node=>node.getAttribute('label'));
  assert.deepEqual(groups,['Market Collections','What the fund holds']);
  assert(funds.querySelector('.sc-rule').textContent.includes('bond'));
  const symbols=funds.querySelectorAll('tbody .ms-screen-symbol').map(node=>node.textContent);
  assert(symbols.length>3&&symbols.every(symbol=>['TLT','HYG','LQD','VCIT','VCSH','USIG','JNK','SHYG','SJNK','IEF','SHY','SGOV','TIP','GOVT'].includes(symbol)),symbols.join(' '));
  assert(!symbols.includes('SPY'),'an equity fund passed the fixed-income rule');
  funds.dispose();funds.remove();
  // A link to a collection the list no longer carries opens the whole market.
  globalThis.location=new URL('http://localhost/?view=stocks&sub=screener&country=US&kind=etfs&collection=largest-inflows');
  const flows=renderDedicatedScreener({});document.body.append(flows);
  const gone=Date.now()+5000;
  while(!flows.querySelector('tbody tr')&&Date.now()<gone)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(flows.querySelector('.sc-preset').value,'all');
  assert(flows.querySelectorAll('tbody tr').length>3);
  flows.dispose();flows.remove();
  globalThis.location=new URL('http://localhost/tools/market-hub-preview.html');
});
await test('the ETFs page is an overview and a prefiltered screener',async()=>{
  globalThis.location=new URL('http://localhost/?view=markets&sub=etfs');
  const page=renderMarketHub({},{section:'etfs'});
  document.body.append(page);
  await settle(page);
  const tabs=page.querySelectorAll('.mh-navigation button');
  // Fund news is a category on Market News, not a tab of its own here.
  assert.deepEqual(tabs.map(node=>node.textContent),['Overview','ETF Screener']);
  assert(tabs[0].classList.contains('is-active'));
  // The overview leads with the collections TradingView's ETF page leads with.
  const collections=page.querySelector('.mh-collections');
  const deadline=Date.now()+5000;
  while(collections.querySelector('.mh-empty--compact')&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  const titles=collections.querySelectorAll('.mh-ranking').map(node=>node.getAttribute('aria-label'));
  assert.deepEqual(titles,['Equity ETFs','Commodity ETFs','Bitcoin ETFs','Gold ETFs','Shariah ETFs']);
  const gold=collections.querySelectorAll('.mh-ranking').find(node=>node.getAttribute('aria-label')==='Gold ETFs');
  assert(gold.textContent.includes('Goldman is not gold'),'the rule is not printed with the collection');
  assert(gold.querySelectorAll('.mh-row').length>0,'the gold collection found no fund');
  assert(gold.textContent.includes('GLD'));
  const bitcoin=collections.querySelectorAll('.mh-ranking').find(node=>node.getAttribute('aria-label')==='Bitcoin ETFs');
  assert(bitcoin.textContent.includes('IBIT'));
  // The tabs this page used to carry are ideas in the screener now.
  tabs[1].click();
  const screener=page.querySelector('.mh-screener');
  assert(screener,'the screener tab is empty');
  assert.equal(page.querySelector('.mh-sections').hidden,true);
  const ideas=screener.querySelectorAll('.mh-idea').map(node=>node.textContent);
  for(const label of ['Most traded','Largest funds','Highest distribution yield','Gold','Shariah'])
    assert(ideas.includes(label),`${label} is not an idea: ${ideas.join(' / ')}`);
  // Every idea is a screen that runs; nothing in the rail is a dead end.
  assert(ideas.every(label=>!/not supplied/i.test(label)),ideas.join(' / '));
  assert(screener.textContent.includes('prefiltered'));
  // An idea is the screener, prefiltered — and the embedded one keeps no title row.
  assert.equal(screener.querySelector('.sc-header h1'),null);
  screener.querySelectorAll('.mh-idea').find(node=>node.textContent.startsWith('Gold')).click();
  const end=Date.now()+5000;
  while(!screener.querySelector('tbody tr')&&Date.now()<end)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(screener.querySelector('.sc-preset').value,'gold');
  assert(screener.querySelectorAll('tbody .ms-screen-symbol').map(node=>node.textContent).includes('GLD'));
  assert.equal(new URLSearchParams(location.search).get('board'),'screener');
  assert.equal(page.querySelector('#market-etfs-news'),null,'the fund wire is Market News now');
  page.dispose();page.remove();
  globalThis.location=new URL('http://localhost/tools/market-hub-preview.html');
});
await test('Market News is one stream in six categories, each saying where it came from',async()=>{
  const {renderNewsroomPage}=await import('../assets/js/newsroom.js');
  const {NAV,defaultSub}=await import('../assets/js/nav.js');
  const menu=NAV.find(item=>item.view==='news').items.filter(item=>!item.hidden).map(item=>item.label);
  assert.deepEqual(menu,['Latest','Stocks','ETFs','Indices','Futures','Economy']);
  assert.equal(defaultSub('news'),'latest');
  const settleStream=async node=>{
    const deadline=Date.now()+5000;
    while(!node.querySelector('.nw-story')&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  };
  const visits=[];
  const page=renderNewsroomPage('latest',{goView:(...args)=>visits.push(args),goSymbol:symbol=>visits.push(['symbol',symbol])});
  document.body.append(page);
  await settleStream(page);
  assert.deepEqual(page.querySelectorAll('.mh-navigation button').map(node=>node.textContent),
    ['Latest','Stocks','ETFs','Indices','Futures','Economy']);
  assert.equal(page.querySelector('.nw-title').textContent,'Latest market news');
  assert(page.querySelectorAll('.nw-story').length>3);
  // The latest four lead the category: one with the room to be read and three
  // headlines beside it, then the rest of the wire as rows.
  const featured=page.querySelector('.nw-featured');
  assert(featured,'the category has no featured block');
  assert.equal(featured.querySelectorAll('.nf__lead').length,1);
  assert.equal(featured.querySelectorAll('.nf__brief').length,3);
  assert.equal(featured.querySelectorAll('.nf__card').length,0,'a category strip carries no cards');
  assert(featured.querySelector('.nf__lead-thumb'),'the lead is not the story with a picture');
  assert.equal(page.querySelectorAll('.nw-story--lead').length,0,'a row still claims to be the lead');
  const headlines=[...page.querySelectorAll('.nw-story__t'),...page.querySelectorAll('.nf__lead-title'),
    ...page.querySelectorAll('.nf__brief-title')].map(node=>node.textContent);
  assert.equal(new Set(headlines).size,headlines.length,'the same story reached the stream twice');
  // The chip is the symbol the wire filed the story under, and what it did.
  const chip=featured.querySelector('.nw-chip');
  assert(chip,'the featured block carries no ticker chip');
  assert(chip.querySelector('.nw-chip__c'),'the chip carries no change');
  assert(/^[+\u2212]\d/.test(chip.querySelector('.nw-chip__c').textContent),chip.textContent);
  chip.click();
  assert.equal(visits.pop()[0],'symbol');
  // A story carries its publisher, its hour and the symbols it was filed under.
  assert(page.querySelector('.nw-story__src').textContent.length>0);
  assert(page.querySelector('.nw-story time').getAttribute('datetime'));
  const tick=page.querySelector('.nw-tick');
  assert(tick,'no story carried the symbol it was filed under');
  tick.click();
  assert.equal(visits.pop()[0],'symbol');
  // No rail of its own: the market summary, the movers and the calendar are the
  // market rail's, which sits beside this page like every other.
  assert.equal(page.querySelector('.nw-rail'),null,'the news page carries its own rail again');
  // A category tab is a navigation, not a filter this page keeps to itself.
  page.querySelectorAll('.mh-navigation button')[2].click();
  assert.deepEqual(visits.pop(),['news','etfs']);
  assert(page.querySelector('.mh-coverage').textContent.includes('de-duplicated by URL'));
  page.dispose();page.remove();

  // ETFs reads the vendor's own tag, so a company story is not a fund story.
  const funds=renderNewsroomPage('etfs',{});
  document.body.append(funds);
  await settleStream(funds);
  assert.equal(funds.querySelector('.nw-title').textContent,'ETF news');
  // The fund is marked on the story, as a chip in the featured block or as a
  // tick on a row further down.
  const tags=[...funds.querySelectorAll('.nw-tick'),...funds.querySelectorAll('.nw-chip')].map(node=>node.textContent);
  assert(tags.some(text=>text.includes('SPDR S&P 500')||text.includes('SPY')),tags.join(' / '));
  assert(!funds.textContent.includes('NVIDIA Corporation draws'),'a company story reached the fund category');
  funds.dispose();funds.remove();

  // Economy is a keyword filter, and a filter prints its pattern.
  const economy=renderNewsroomPage('economy',{});
  document.body.append(economy);
  const deadline=Date.now()+5000;
  while(!economy.querySelector('.mh-coverage')&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  const note=economy.querySelector('.mh-coverage').textContent;
  assert(note.includes('keyword filter run in your browser'),note.slice(0,120));
  assert(note.includes('inflation'),'the pattern is not printed');
  economy.dispose();economy.remove();

  // The topics that left the strip keep their routes.
  const legacy=renderNewsroomPage('ratings',{});
  assert.equal(legacy.querySelector('.nw-title').textContent,'Analyst ratings');
  legacy.dispose();
  // And the old name for Stocks still lands on the stories it meant.
  const alias=renderNewsroomPage('stock',{});
  assert.equal(alias.querySelector('.nw-title').textContent,'Stock news');
  alias.dispose();
});
await test('Home is a banner, the wire, and a section for each part of the market',async()=>{
  const {renderHomePage}=await import('../assets/js/home.js');
  const visits=[];
  const page=renderHomePage(null,{goView:(...args)=>visits.push(args),goSymbol:symbol=>visits.push(['symbol',symbol])});
  document.body.append(page);
  const deadline=Date.now()+5000;
  while(!page.querySelector('.hm-tile')&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  // The banner is the levels, then the listings moving most.
  assert(page.querySelectorAll('.hm-tile').length>8,`${page.querySelectorAll('.hm-tile').length} tiles`);
  assert(page.querySelector('.hm-tile').textContent.includes('S&P 500'));
  assert(page.querySelectorAll('.hm-tile.is-up').length&&page.querySelectorAll('.hm-tile.is-down').length,
    'the banner shows no direction');
  // The wire leads in a block of its own: one story with the room to be read,
  // three cards under it, four headlines beside.
  const top=page.querySelector('.hm-top');
  assert.equal(top.querySelectorAll('.nf__lead').length,1);
  assert.equal(top.querySelectorAll('.nf__card').length,3);
  assert.equal(top.querySelectorAll('.nf__brief').length,4);
  assert(top.querySelector('.nf__lead-thumb'),'the lead is not the story with a picture');
  assert(top.querySelector('.nw-chip'),'no ticker chip on the front page');
  // Then the rest of the wire as rows, beside what is popular.
  assert(page.querySelectorAll('.hm-lead .nw-story').length>1);
  assert.equal(page.querySelectorAll('.nw-story--lead').length,0);
  assert.deepEqual(page.querySelectorAll('.nw-rail__h').map(node=>node.textContent.replace('›','').trim()),
    ['Trending','Top gainers','Top losers']);
  // Five sections, built empty and loaded when they are reached.
  const parts=page.querySelectorAll('.hm-section');
  assert.deepEqual(parts.map(node=>node.getAttribute('aria-label')),
    ['Markets summary','US stocks','ETFs','Commodities','Economy']);
  assert.equal(parts[1].querySelectorAll('.mh-row').length,0,'a section below the fold loaded before it was reached');
  for(const part of parts) await part.load();
  const until=Date.now()+8000;
  while(page.querySelectorAll('.hm-section [aria-busy="true"], .hm-section[aria-busy="true"]').length&&Date.now()<until)
    await new Promise(resolve=>setImmediate(resolve));
  const [summary,stocks,etfs,commodities,economy]=parts;
  // The world's benchmarks: one charted, the rest listed beside it, and the
  // list is the chart's own control.
  assert(summary.querySelector('.hm-summary__chart .mhc'),'the summary has no chart');
  const majors=summary.querySelectorAll('.hm-major__row');
  assert(majors.length>3,`${majors.length} major indices`);
  assert.equal(summary.querySelectorAll('.hm-major__row.is-active').length,1);
  assert(majors[0].textContent.includes('S&P 500'));
  assert(majors[0].querySelector('.hm-major__name small'),'no ticker chip on a major index');
  majors[2].click();
  assert(majors[2].classList.contains('is-active')&&!majors[0].classList.contains('is-active'),
    'picking a benchmark did not move the chart');
  assert.equal(summary.querySelectorAll('.hm-econ__row').length,4);
  assert(summary.textContent.includes('Real GDP'));
  assert(summary.querySelectorAll('.nw-story').length===3,'the world news strip is not three stories');
  // The four rankings the reader asked for, in that order.
  assert.deepEqual(stocks.querySelectorAll('.mh-ranking').map(node=>node.getAttribute('aria-label')),
    ['Gainers','Losers','Highest volume','Most volatile']);
  assert(stocks.querySelectorAll('.mh-row').length>8);
  assert.equal(stocks.querySelectorAll('.nw-story').length,3);
  assert.equal(etfs.querySelectorAll('.mh-ranking').length,4);
  // Commodities is energy and metals, with the wire that follows them.
  assert.deepEqual(commodities.querySelectorAll('.mh-ranking').map(node=>node.getAttribute('aria-label')),['Energy','Metals']);
  assert.equal(commodities.querySelectorAll('.nw-story').length,3);
  // Economy is the inflation map alone — the GDP map stays on its own page —
  // and the releases as cards.
  assert.equal(economy.querySelectorAll('.em-section').length,1);
  assert(economy.querySelector('#economy-map-inflation'));
  assert(economy.querySelectorAll('.mhw-release').length>0);
  // Every heading leads somewhere.
  stocks.querySelector('.mh-heading button').click();
  assert.deepEqual(visits.pop(),['markets','stocks',{country:'US'}]);
  page.dispose();page.remove();

  // No key, no market: one note rather than nine empty boxes.
  storage.delete('mazvantage.fmp.key'); fmp.clearCache();
  const bare=renderHomePage(null,{});
  assert(bare.querySelector('.mh-connection-note'),'the no-key page does not say what is missing');
  assert.equal(bare.querySelectorAll('.hm-section').length,0);
  bare.dispose();
  storage.set('mazvantage.fmp.key',FIXTURE_KEY); fmp.clearCache();
});
await test('screener preset catalog merges ideas, covers sectors and preserves ranked data',async()=>{
  const {SCREENER_PRESETS,screenerPreset,presetIdea,runScreenerPreset}=await import('../assets/js/screener-presets.js');
  const {IDEAS}=await import('../assets/js/ideas.js');
  assert.equal(new Set(SCREENER_PRESETS.map(item=>item.id)).size,SCREENER_PRESETS.length);
  assert.equal(new Set(SCREENER_PRESETS.map(item=>item.title.toLowerCase())).size,SCREENER_PRESETS.length);
  assert.equal(SCREENER_PRESETS.filter(item=>item.group==='Top Stocks by Sector').length,11);
  assert.equal(screenerPreset('us-tech-top15').id,'top-tech-stocks');
  assert.equal(screenerPreset('top-quant-stocks').id,'stocks-by-quant');
  assert.equal(presetIdea(screenerPreset('top-tech-stocks'),'FR').universe.country,'FR');
  assert.equal(presetIdea(screenerPreset('top-tech-stocks'),'WORLD').universe.country,undefined);
  assert.equal(IDEAS.find(idea=>idea.key==='top-tech-stocks').universe.country,'US');
  assert(screenerPreset('most-shorted-stocks').unavailable);
  const result=await runScreenerPreset(screenerPreset('stocks-by-quant'),'US');
  assert.equal(result.state,'ok');
  assert(result.rows.length>0);
  assert(result.rows.every((row,index)=>row.presetRank===index+1&&row.companyName&&row.bags&&row.volume!==undefined));
  const reit=presetIdea(screenerPreset('top-reits'),'US');
  assert(reit.rules[0].test({industry:'REIT - Retail'}));
  assert(!reit.rules[0].test({industry:'Real Estate Services'}));
});
console.log(`Passed ${count} market hub regression checks; ${calls.length} mocked FMP calls; no external requests.`);
