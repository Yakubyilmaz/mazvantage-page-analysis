/* Futures: what the board machine needs to know about contracts.

   The page itself is `marketboard.js`, the same one Market Indices runs on.
   Collections are the ones a futures board is read by — agricultural, energy,
   currencies, metals, index and rate contracts — and they are this app's
   grouping, because FMP's commodity feed carries no category of its own. */
import {
  FUTURES_BOARDS, PRICE_CHANGE_COLUMNS, loadHubSection, loadFuturesBoard, loadPriceChanges, loadFuturesNews,
} from './markethub-data.js';
import { renderMarketBoard, OVERVIEW_COLUMNS } from './marketboard.js';

const PERFORMANCE_COLUMNS = [
  { key: 'name', label: 'Contract' },
  { key: 'changesPercentage', label: 'Chg %', numeric: true, tone: true, suffix: '%' },
  ...PRICE_CHANGE_COLUMNS.map(column => ({ key: `perf:${column.key}`, label: column.label, numeric: true, tone: true, suffix: '%' })),
];
const CONTRACT_COLUMNS = [
  { key: 'name', label: 'Contract' },
  ...OVERVIEW_COLUMNS.slice(1),
  { key: 'tradeMonth', label: 'Delivery' },
];

export function renderMarketFutures(nav = {}) {
  return renderMarketBoard(nav, {
    id: 'futures',
    title: 'Futures',
    meta: 'Every contract FMP quotes, by collection',
    unit: 'contracts',
    boards: FUTURES_BOARDS,

    news: {
      load: loadFuturesNews,
      note: 'Market-wide stories that name a contract this board tracks, newest first. Each story opens on its publisher\u2019s site.',
    },

    summary: {
      load: refresh => loadHubSection('futures', { refresh }),
      pick: (data) => {
        const quotes = (data.quotes || []).filter(row => row.available !== false);
        const summary = quotes.filter(row => row.summary);
        return {
          heading: 'Futures market summary',
          note: 'The six contracts a futures board opens on, each line starting at zero on the first session of the window. Prices are FMP’s continuous front-month series, in the contract’s own currency — USX is US cents.',
          quotes: summary.length ? summary : quotes.slice(0, 6),
          seeAll: { label: 'See all futures', tab: 'all' },
          rail: { heading: 'Other contracts', rows: quotes.filter(row => !row.summary), tab: 'all' },
        };
      },
    },

    board: {
      load: loadFuturesBoard,
      performance: loadPriceChanges,
      rows: (id, data) => {
        const all = data.rows || [];
        if (id === 'all') return all;
        const board = FUTURES_BOARDS.find(item => item.id === id);
        return board?.group ? all.filter(row => row.group === board.group) : all;
      },
      note: (id, count, result, label) => {
        if (id === 'all') return result?.status === 'ok'
          ? `Every contract FMP lists, ${count} in all. Prices are its continuous front-month series; USX denotes US cents.`
          : `The ${count} contracts this app names. FMP's commodity feed prices them once it is connected.`;
        if (id === 'currencies') return 'FMP quotes the US Dollar index as a futures contract. The individual currency futures a larger board carries are not in its commodity feed.';
        if (id === 'indices') return 'Index futures on the US benchmarks, which is what FMP’s commodity feed carries.';
        if (id === 'rates') return 'US Treasury and fed funds contracts. Government bond futures for other countries are not supplied by this feed.';
        return `${label}: the contracts this page can place there. Anything FMP lists that it cannot place stays under All futures.`;
      },
      columns: (id, mode) => (mode === 'performance' ? PERFORMANCE_COLUMNS : CONTRACT_COLUMNS),
    },
  });
}
