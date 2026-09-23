/* Explicit fixture-only entry point. Never imported by the production app. */
import { FIXTURE_KEY, createFixtureFetch } from './market-hub-preview-fixtures.mjs';

if (!/^https?:$/.test(location.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  throw new Error('The UI fixture harness is restricted to a local preview server.');
}
const noKey = new URLSearchParams(location.search).get('mode') === 'no-key';
// This override exists only in this document's JavaScript realm; persistent storage is untouched.
const realGet = Storage.prototype.getItem;
Storage.prototype.getItem = function (key) {
  return key === 'mazvantage.fmp.key' ? (noKey ? '' : FIXTURE_KEY) : realGet.call(this, key);
};
if (new URLSearchParams(location.search).has('apikey')) throw new Error('Do not pass a real API key to the fixture harness.');
const calls = [];
globalThis.fetch = createFixtureFetch(calls);
const toast = document.getElementById('fixture-toast');
const announce = message => { toast.textContent = message; toast.hidden = false; };
// `?page=indices` previews the Market Indices board, `?page=<section>` one hub
// section as its own page (economy, futures, corporate, etfs), `?page=news` the
// Market News stream (`&topic=` picks the category); anything else is the whole
// hub.
const page = new URLSearchParams(location.search).get('page');
const board = page === 'indices' || page === 'futures';
const section = ['economy', 'corporate', 'etfs'].includes(page) ? page : null;
const nav = {
  goSymbol: symbol => announce(`Fixture navigation: ${symbol}`),
  goView: (view, sub) => announce(`Fixture navigation: ${view} / ${sub}`),
  openSettings: () => announce('Fixture settings action — no credentials required'),
};
const hub = page === 'home' ? (await import('../assets/js/home.js')).renderHomePage(null, nav)
  : page === 'news' ? (await import('../assets/js/newsroom.js'))
  .renderNewsroomPage(new URLSearchParams(location.search).get('topic') || 'latest', nav)
  : page === 'screener' ? (await import('../assets/js/screener.js')).renderDedicatedScreener(nav)
  : page === 'futures' ? (await import('../assets/js/marketfutures.js')).renderMarketFutures(nav)
  : board ? (await import('../assets/js/marketindices.js')).renderMarketIndices(nav)
    : (await import('../assets/js/markethub.js')).renderMarketHub(nav, { section });
document.getElementById('fixture-root').append(hub);
const theme = document.getElementById('fixture-theme');
theme.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  theme.textContent = dark ? 'Light theme' : 'Dark theme';
});
globalThis.__marketHubPreview = { hub, calls, noKey };
document.documentElement.dataset.previewReady = 'true';
if (new URLSearchParams(location.search).get('all') === '1') {
  for (const button of hub.querySelectorAll('.mh-navigation button')) button.click();
  const deadline = Date.now() + 10000;
  while (hub.querySelector('[aria-busy="true"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo(0, 0);
  document.documentElement.dataset.previewLoaded = 'true';
}
window.addEventListener('pagehide', () => hub.dispose(), { once: true });
