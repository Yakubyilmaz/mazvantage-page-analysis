/* Market Indices: what the board machine needs to know about indices.

   The page itself is `marketboard.js`. This file is the half that is about
   indices — which collections exist, which rows fall under each, what each
   note can honestly claim, and what the summary compares. */
import {
  INDEX_BOARDS, PRICE_CHANGE_COLUMNS, CURRENCY_INDICES,
  countryOf, loadHubSection, loadIndexBoard, loadPriceChanges, loadIndexNews,
} from './markethub-data.js';
import { storedCountry } from './markethub-ui.js';
import { renderMarketBoard, OVERVIEW_COLUMNS } from './marketboard.js';

const PERFORMANCE_COLUMNS = [
  { key: 'name', label: 'Index' },
  { key: 'changesPercentage', label: 'Chg %', numeric: true, tone: true, suffix: '%' },
  ...PRICE_CHANGE_COLUMNS.map(column => ({ key: `perf:${column.key}`, label: column.label, numeric: true, tone: true, suffix: '%' })),
];
const SECTOR_COLUMNS = [
  { key: 'name', label: 'Sector' },
  { key: 'changesPercentage', label: 'Chg %', numeric: true, tone: true, suffix: '%' },
  { key: 'exchange', label: 'Exchange' },
];

export function renderMarketIndices(nav = {}) {
  const country = countryOf(storedCountry());
  return renderMarketBoard(nav, {
    id: 'indices',
    title: 'Market Indices',
    meta: 'Every index FMP quotes, by region',
    unit: 'indices',
    boards: INDEX_BOARDS,

    news: {
      load: loadIndexNews,
      note: 'Market-wide stories that name an index this board tracks, newest first — whichever country the index belongs to. Each story opens on its publisher’s site.',
    },

    summary: {
      load: refresh => loadHubSection('indices', { country: country.code, refresh }),
      pick: (data) => {
        // The chosen country's own indices, minus the volatility index: an
        // implied-volatility series on a performance axis is another number.
        const local = (data.quotes || []).filter(row => !row.volatility);
        return {
          heading: `${country.short} market summary`,
          note: `Indices measuring the ${country.name} market, each line starting at zero on the first session of the window. Levels are points; the axis is performance.`,
          quotes: local.some(row => row.summary) ? local.filter(row => row.summary) : local,
          seeAll: { label: 'See all indices', tab: 'all' },
          rail: { heading: 'World indices', rows: data.worldIndices || [], tab: 'major' },
        };
      },
    },

    board: {
      load: loadIndexBoard,
      performance: loadPriceChanges,
      rows: (id, data) => {
        const all = data.rows || [];
        if (id === 'sectors') return data.sectors || [];
        if (id === 'all') return all;
        if (id === 'major') return all.filter(row => row.primary);
        if (id === 'us') return all.filter(row => row.market === 'US');
        if (id === 'currencies') return all.filter(row => CURRENCY_INDICES.includes(row.symbol));
        const board = INDEX_BOARDS.find(item => item.id === id);
        return board?.region ? all.filter(row => row.region === board.region) : all;
      },
      note: (id, count, result, label) => {
        if (id === 'sectors') return 'FMP publishes a sector performance snapshot rather than S&P sector index levels, so this table carries the session move and the exchange it was measured on — no price, high or low.';
        if (id === 'currencies') return 'FMP quotes the US Dollar index as a futures contract; broader currency index coverage is not supplied by this feed.';
        if (id === 'major') return 'One benchmark for each country the Market Data picker offers.';
        if (id === 'all') return result?.status === 'ok'
          ? `Every index FMP returned, ${count} in all, plus the benchmarks this app names.`
          : `The ${count} benchmarks this app names. FMP's index feed fills in the rest of the world once it is connected.`;
        if (id === 'us') return 'Indices measuring the United States market, including the volatility index.';
        return `${label}: the indices this page can place there from its own catalog or the listing suffix. Anything FMP returns that it cannot place stays under All indices.`;
      },
      // The sector snapshot has no price, high or low and no series behind it,
      // so it has no performance view either.
      columns: (id, mode) => (id === 'sectors' ? (mode === 'performance' ? null : SECTOR_COLUMNS)
        : mode === 'performance' ? PERFORMANCE_COLUMNS : OVERVIEW_COLUMNS),
    },
  });
}
