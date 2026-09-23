/* Market Data hub: static instrument identity, live FMP values, lazy sections.
   Catalogs contain no prices, returns, headcounts, or fabricated chart series. */
import {
  getApiKey, fetchBatchQuotes, fetchMarket, fetchScreener, fetchCalendar,
  fetchFor, fetchEtfInfo, fetchHubFeed, fetchNewsFeed,
} from './fmp.js';
import { economyRates, countryReleases } from './economy-data.js';
import { fundsIn } from './etf-collections.js';

const panel = (id, label, metricKey = 'changesPercentage', metricLabel = 'Change %') => ({ id, label, metricKey, metricLabel });

/* `scope` says whose market a section is about: `country` follows the picker,
   `global` reads the same under every country, and `us` is a US-only dataset
   the hub labels as such rather than pretending it travels. */
export const HUB_SECTIONS = [
  { id: 'indices', title: 'Indices', scope: 'country', tabs: [panel('home', 'Local indices'), panel('world', 'World indices')] },
  { id: 'stocks', title: 'Stocks', scope: 'country', tabs: [panel('volume', 'Highest volume stocks', 'volume', 'Volume'), panel('volatility', 'Most volatile stocks', 'rangePct', 'Day range %'), panel('gainers', 'Stock gainers'), panel('losers', 'Stock losers')] },
  { id: 'world', title: 'World stocks', scope: 'global', tabs: [panel('largest', 'Largest world companies', 'marketCap', 'Market cap'), panel('employers', 'Largest employers', 'employees', 'Employees')] },
  { id: 'futures', title: 'Futures and commodities', scope: 'global', tabs: [panel('energy', 'Energy'), panel('metals', 'Metals'), panel('agriculture', 'Agriculture'), panel('indices', 'US index futures')] },
  { id: 'bonds', title: 'Government bonds', scope: 'country', tabs: [] },
  { id: 'corporate', title: 'Corporate bonds', scope: 'country', tabs: [panel('investmentGrade', 'Investment-grade bond ETFs'), panel('highYield', 'High-yield bond ETFs')] },
  { id: 'etfs', title: 'ETFs', scope: 'country', tabs: [panel('volume', 'Most traded ETFs', 'volume', 'Volume'), panel('returns', 'Best 1-year price performance', 'return1Y', '1Y price %'), panel('dividendYield', 'Highest distribution yield', 'dividendYield', 'TTM yield %'), panel('aum', 'Largest assets under management', 'aum', 'AUM')] },
  /* The World view's answer to the country ETF section beside it. It is a
     section of its own rather than a mode of that one because it ranks a
     different universe on different questions: not the funds listed in one
     market, but the funds whose mandate is every market, and the funds that
     each hold one. */
  { id: 'worldEtfs', title: 'ETFs of the World', scope: 'global', tabs: [
    panel('largest', 'Largest funds in the world', 'marketCap', 'Fund size'),
    panel('traded', 'Most traded funds', 'volume', 'Volume'),
    panel('global', 'World and global mandates'),
    panel('country', 'One country each'),
  ] },
  { id: 'economy', title: 'Economy', scope: 'country', tabs: [] },
];

/* The countries the page can be switched to.

   The set is every country FMP publishes an exchange for — its own
   `available-exchanges` list, which is the honest test of "a market this page
   can show". The vendor's `available-countries` list is three times longer and
   is the *domicile* field: it counts the Cayman Islands and the Falklands,
   neither of which has a market to look at.

   `exchanges` and `suffixes` are what marks a listing as belonging to the
   country. They filter calendar rows and screen its fund listings, so a value
   this table gets wrong empties a list rather than filling it with another
   country's companies. `movers`, `treasury` and `indicators` flag the three
   FMP feeds that exist for the United States only; every other country states
   that gap in their place.

   There is no flag field any more: a flag is drawn from the ISO code by
   `countryFlag()` rather than stored, because the emoji this column used to
   hold renders as two letters on Windows. */
const place = (code, name, group, currency, exchanges, suffixes, extra = {}) => ({
  code, name, short: name, group, currency, exchanges, suffixes, calendar: [code, name],
  // The picker groups by continent; the index board splits Asia from the
  // Pacific, as every indices board does, so the two live side by side.
  region: { Americas: 'americas', Europe: 'europe', 'Middle East': 'middle-east', Africa: 'africa' }[group] || 'asia',
  ...extra,
});
export const COUNTRIES = [
  place('US', 'United States', 'Americas', 'USD', ['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA', 'BATS', 'CBOE'], [],
    { short: 'US', movers: true, treasury: true, indicators: true, calendar: ['US', 'USA', 'United States'] }),
  place('CA', 'Canada', 'Americas', 'CAD', ['TSX', 'TSXV'], ['.TO', '.V']),
  place('BR', 'Brazil', 'Americas', 'BRL', ['SAO'], ['.SA']),
  place('MX', 'Mexico', 'Americas', 'MXN', ['MEX'], ['.MX']),
  place('AR', 'Argentina', 'Americas', 'ARS', ['BUE'], ['.BA']),
  place('CL', 'Chile', 'Americas', 'CLP', ['SGO'], ['.SN']),
  // The economic calendar spells this country `UK`, not `GB`, so the calendar
  // aliases carry both — with only the ISO code, its releases matched nothing.
  place('GB', 'United Kingdom', 'Europe', 'GBP', ['LSE', 'IOB'], ['.L', '.IL'], { short: 'UK', calendar: ['GB', 'UK', 'United Kingdom'] }),
  place('DE', 'Germany', 'Europe', 'EUR', ['XETRA'], ['.DE', '.F']),
  place('FR', 'France', 'Europe', 'EUR', ['PAR', 'EURONEXT'], ['.PA']),
  place('NL', 'Netherlands', 'Europe', 'EUR', ['AMS', 'EURONEXT'], ['.AS']),
  place('CH', 'Switzerland', 'Europe', 'CHF', ['SIX'], ['.SW']),
  place('ES', 'Spain', 'Europe', 'EUR', ['BME', 'MCE'], ['.MC']),
  place('IT', 'Italy', 'Europe', 'EUR', ['MIL'], ['.MI']),
  place('SE', 'Sweden', 'Europe', 'SEK', ['STO'], ['.ST']),
  place('AT', 'Austria', 'Europe', 'EUR', ['VIE'], ['.VI']),
  place('BE', 'Belgium', 'Europe', 'EUR', ['BRU'], ['.BR']),
  place('CZ', 'Czechia', 'Europe', 'CZK', ['PRA'], ['.PR'], { calendar: ['CZ', 'Czechia', 'Czech Republic'] }),
  place('DK', 'Denmark', 'Europe', 'DKK', ['CPH'], ['.CO']),
  place('FI', 'Finland', 'Europe', 'EUR', ['HEL'], ['.HE']),
  // The calendar spells Greece `EL`, the European Union's own code for it,
  // exactly as it spells the United Kingdom `UK`.
  place('GR', 'Greece', 'Europe', 'EUR', ['ATH'], ['.AT'], { calendar: ['GR', 'EL', 'Greece'] }),
  place('IE', 'Ireland', 'Europe', 'EUR', ['DUB'], ['.IR']),
  place('IS', 'Iceland', 'Europe', 'ISK', ['ICE'], ['.IC']),
  place('NO', 'Norway', 'Europe', 'NOK', ['OSL'], ['.OL']),
  place('PL', 'Poland', 'Europe', 'PLN', ['WSE'], ['.WA']),
  place('PT', 'Portugal', 'Europe', 'EUR', ['LIS'], ['.LS']),
  place('RU', 'Russia', 'Europe', 'RUB', ['MCX'], ['.ME']),
  place('TR', 'Turkey', 'Europe', 'TRY', ['IST'], ['.IS']),
  place('IL', 'Israel', 'Middle East', 'ILS', ['TLV'], ['.TA']),
  place('AE', 'United Arab Emirates', 'Middle East', 'AED', ['DFM'], ['.AE'],
    { short: 'UAE', calendar: ['AE', 'UAE', 'United Arab Emirates'] }),
  place('QA', 'Qatar', 'Middle East', 'QAR', ['DOH'], ['.QA']),
  place('SA', 'Saudi Arabia', 'Middle East', 'SAR', ['SAU'], ['.SR']),
  place('ZA', 'South Africa', 'Africa', 'ZAR', ['JNB'], ['.JO']),
  place('JP', 'Japan', 'Asia-Pacific', 'JPY', ['JPX'], ['.T']),
  place('CN', 'China', 'Asia-Pacific', 'CNY', ['SHH', 'SHZ'], ['.SS', '.SZ']),
  place('HK', 'Hong Kong', 'Asia-Pacific', 'HKD', ['HKSE'], ['.HK']),
  place('IN', 'India', 'Asia-Pacific', 'INR', ['NSE', 'BSE'], ['.NS', '.BO']),
  place('KR', 'South Korea', 'Asia-Pacific', 'KRW', ['KSC', 'KOE'], ['.KS', '.KQ']),
  place('TW', 'Taiwan', 'Asia-Pacific', 'TWD', ['TAI', 'TWO'], ['.TW', '.TWO']),
  place('SG', 'Singapore', 'Asia-Pacific', 'SGD', ['SES'], ['.SI']),
  place('ID', 'Indonesia', 'Asia-Pacific', 'IDR', ['JKT'], ['.JK']),
  place('MY', 'Malaysia', 'Asia-Pacific', 'MYR', ['KLS'], ['.KL']),
  place('TH', 'Thailand', 'Asia-Pacific', 'THB', ['SET'], ['.BK']),
  place('AU', 'Australia', 'Asia-Pacific', 'AUD', ['ASX'], ['.AX'], { region: 'pacific' }),
  place('NZ', 'New Zealand', 'Asia-Pacific', 'NZD', ['NZE'], ['.NZ'], { region: 'pacific' }),
];

/* The country's market as one tradable instrument.

   An index is a measurement — you cannot hold the CAC 40. The US-listed
   single-country fund that tracks it is what a reader would actually buy the
   market through, so it rides in the indices rail beside the benchmark, where
   the two can be charted against each other. It stays labelled as a fund: the
   price is dollars rather than points, and a currency-unhedged fund and its
   home index do not return the same thing.

   Mostly iShares' MSCI single-country series, with Global X where iShares has
   no fund, and SPY for the United States because that is the fund a US reader
   means. Every symbol was checked against a live quote. Three countries have
   none and say so by their absence: Czechia and Iceland were never wrapped in
   one, and Russia's ERUS still carries a price that has not moved since
   trading in it stopped — a dead tile is worse than no tile. */
const COUNTRY_FUNDS = {
  US: ['SPY', 'SPDR S&P 500 ETF Trust', 'S&P 500 ETF'],
  CA: ['EWC', 'iShares MSCI Canada ETF', 'MSCI Canada'],
  BR: ['EWZ', 'iShares MSCI Brazil ETF', 'MSCI Brazil'],
  MX: ['EWW', 'iShares MSCI Mexico ETF', 'MSCI Mexico'],
  AR: ['ARGT', 'Global X MSCI Argentina ETF', 'MSCI Argentina'],
  CL: ['ECH', 'iShares MSCI Chile ETF', 'MSCI Chile'],
  GB: ['EWU', 'iShares MSCI United Kingdom ETF', 'MSCI UK'],
  DE: ['EWG', 'iShares MSCI Germany ETF', 'MSCI Germany'],
  FR: ['EWQ', 'iShares MSCI France ETF', 'MSCI France'],
  NL: ['EWN', 'iShares MSCI Netherlands ETF', 'MSCI Netherlands'],
  CH: ['EWL', 'iShares MSCI Switzerland ETF', 'MSCI Switzerland'],
  ES: ['EWP', 'iShares MSCI Spain ETF', 'MSCI Spain'],
  IT: ['EWI', 'iShares MSCI Italy ETF', 'MSCI Italy'],
  SE: ['EWD', 'iShares MSCI Sweden ETF', 'MSCI Sweden'],
  AT: ['EWO', 'iShares MSCI Austria ETF', 'MSCI Austria'],
  BE: ['EWK', 'iShares MSCI Belgium ETF', 'MSCI Belgium'],
  DK: ['EDEN', 'iShares MSCI Denmark ETF', 'MSCI Denmark'],
  FI: ['EFNL', 'iShares MSCI Finland ETF', 'MSCI Finland'],
  GR: ['GREK', 'Global X MSCI Greece ETF', 'MSCI Greece'],
  IE: ['EIRL', 'iShares MSCI Ireland ETF', 'MSCI Ireland'],
  NO: ['ENOR', 'iShares MSCI Norway ETF', 'MSCI Norway'],
  PL: ['EPOL', 'iShares MSCI Poland ETF', 'MSCI Poland'],
  PT: ['PGAL', 'Global X MSCI Portugal ETF', 'MSCI Portugal'],
  TR: ['TUR', 'iShares MSCI Turkey ETF', 'MSCI Turkey'],
  IL: ['EIS', 'iShares MSCI Israel ETF', 'MSCI Israel'],
  AE: ['UAE', 'iShares MSCI UAE ETF', 'MSCI UAE'],
  QA: ['QAT', 'iShares MSCI Qatar ETF', 'MSCI Qatar'],
  SA: ['KSA', 'iShares MSCI Saudi Arabia ETF', 'MSCI Saudi Arabia'],
  ZA: ['EZA', 'iShares MSCI South Africa ETF', 'MSCI South Africa'],
  JP: ['EWJ', 'iShares MSCI Japan ETF', 'MSCI Japan'],
  CN: ['MCHI', 'iShares MSCI China ETF', 'MSCI China'],
  HK: ['EWH', 'iShares MSCI Hong Kong ETF', 'MSCI Hong Kong'],
  IN: ['INDA', 'iShares MSCI India ETF', 'MSCI India'],
  KR: ['EWY', 'iShares MSCI South Korea ETF', 'MSCI Korea'],
  TW: ['EWT', 'iShares MSCI Taiwan ETF', 'MSCI Taiwan'],
  SG: ['EWS', 'iShares MSCI Singapore ETF', 'MSCI Singapore'],
  ID: ['EIDO', 'iShares MSCI Indonesia ETF', 'MSCI Indonesia'],
  MY: ['EWM', 'iShares MSCI Malaysia ETF', 'MSCI Malaysia'],
  TH: ['THD', 'iShares MSCI Thailand ETF', 'MSCI Thailand'],
  AU: ['EWA', 'iShares MSCI Australia ETF', 'MSCI Australia'],
  NZ: ['ENZL', 'iShares MSCI New Zealand ETF', 'MSCI New Zealand'],
};
for (const country of COUNTRIES) {
  const fund = COUNTRY_FUNDS[country.code];
  country.fund = fund ? { symbol: fund[0], name: fund[1], shortName: fund[2], kind: 'etf', currency: 'USD', color: '#00b4c4' } : null;
}
export const DEFAULT_COUNTRY = 'US';
export const countryOf = (code) => COUNTRIES.find((c) => c.code === String(code || '').toUpperCase()) || COUNTRIES[0];

const colors = ['#2962ff', '#00b4c4', '#f2a900', '#a855f7', '#ef5350', '#089981', '#e879ac', '#64748b'];
const instruments = (kind, rows) => rows.map(([symbol, name, extra = {}], i) => ({
  symbol, name, shortName: name, kind, currency: 'USD', color: colors[i % colors.length], ...extra,
}));

export const CATALOGS = {
  // One row per index, tagged with the country whose market it measures.
  // `primary` marks the benchmark another country's reader sees in the rail.
  indices: instruments('index', [
    // `summary` marks the six the market summary chart compares; the rest of
    // the US set fills the board's own US table.
    ['^GSPC', 'S&P 500', { shortName: 'S&P 500', market: 'US', primary: true, summary: true }],
    ['^NDX', 'Nasdaq 100', { market: 'US', summary: true }], ['^DJI', 'Dow Jones', { market: 'US', summary: true }],
    ['^VIX', 'Volatility S&P 500', { shortName: 'VIX', market: 'US', volatility: true }],
    ['^RUT', 'Russell 2000', { market: 'US', summary: true }], ['^IXIC', 'Nasdaq Composite', { market: 'US', summary: true }],
    ['^NYA', 'NYSE Composite', { mark: 'NYA', market: 'US', summary: true }],
    ['^OEX', 'S&P 100', { mark: 'OEX', market: 'US' }], ['^MID', 'S&P MidCap 400', { mark: 'MID', market: 'US' }],
    ['^SML', 'S&P SmallCap 600', { mark: 'SML', market: 'US' }],
    ['^DJT', 'Dow Jones Transportation', { mark: 'DJT', market: 'US' }],
    ['^DJU', 'Dow Jones Utilities', { mark: 'DJU', market: 'US' }],
    ['^GSPTSE', 'S&P/TSX Composite', { mark: 'TSX', shortName: 'S&P/TSX', market: 'CA', primary: true }],
    ['^BVSP', 'Bovespa', { mark: 'IBOV', market: 'BR', primary: true }],
    ['^MXX', 'S&P/BMV IPC', { mark: 'IPC', shortName: 'IPC', market: 'MX', primary: true }],
    ['^FTSE', 'FTSE 100', { mark: 'FTSE', market: 'GB', primary: true }], ['^FTMC', 'FTSE 250', { mark: 'F250', market: 'GB' }],
    ['^GDAXI', 'DAX', { mark: 'DAX', market: 'DE', primary: true }], ['^MDAXI', 'MDAX', { mark: 'MDAX', market: 'DE' }],
    ['^FCHI', 'CAC 40', { mark: 'CAC', market: 'FR', primary: true }],
    ['^AEX', 'AEX', { mark: 'AEX', market: 'NL', primary: true }],
    ['^SSMI', 'Swiss Market Index', { mark: 'SMI', shortName: 'SMI', market: 'CH', primary: true }],
    ['^IBEX', 'IBEX 35', { mark: 'IBEX', market: 'ES', primary: true }],
    ['FTSEMIB.MI', 'FTSE MIB', { mark: 'MIB', market: 'IT', primary: true }],
    ['^OMX', 'OMX Stockholm 30', { mark: 'OMX', shortName: 'OMXS30', market: 'SE', primary: true }],
    ['^N225', 'Nikkei 225', { mark: 'N225', market: 'JP', primary: true }],
    ['000001.SS', 'SSE Composite', { mark: 'SSE', market: 'CN', primary: true }],
    ['^HSI', 'Hang Seng', { mark: 'HSI', market: 'HK', primary: true }],
    ['^BSESN', 'BSE Sensex', { mark: 'BSE', shortName: 'Sensex', market: 'IN', primary: true }],
    ['^NSEI', 'Nifty 50', { mark: 'NFTY', market: 'IN' }],
    ['^KS11', 'KOSPI', { mark: 'KSPI', market: 'KR', primary: true }],
    ['^TWII', 'TAIEX', { mark: 'TAI', market: 'TW', primary: true }],
    ['^STI', 'Straits Times Index', { mark: 'STI', shortName: 'STI', market: 'SG', primary: true }],
    ['^AXJO', 'S&P/ASX 200', { mark: 'ASX', shortName: 'ASX 200', market: 'AU', primary: true }],
    /* The benchmarks of the markets added later. Every symbol here was read
       back from FMP's own index list and then quoted: the vendor spells
       several of them differently from the obvious guess — `WIG20.WA` not
       `^WIG20`, `XU100.IS` not `^XU100`, `^TASI.SR` not `^TASI`, and Denmark's
       is the OMX Copenhagen 20 rather than the 25. A country whose benchmark
       FMP does not publish has none here and its indices section says so. */
    ['^MERV', 'S&P Merval', { mark: 'MERV', market: 'AR', primary: true }],
    ['^ATX', 'ATX', { mark: 'ATX', market: 'AT', primary: true }],
    ['^BFX', 'BEL 20', { mark: 'BEL', market: 'BE', primary: true }],
    ['^OMXC20', 'OMX Copenhagen 20', { mark: 'OMXC', shortName: 'OMXC20', market: 'DK', primary: true }],
    ['^OMXH25', 'OMX Helsinki 25', { mark: 'OMXH', shortName: 'OMXH25', market: 'FI', primary: true }],
    ['^OSEAX', 'Oslo Bors All-Share', { mark: 'OSE', shortName: 'OSEAX', market: 'NO', primary: true }],
    ['WIG20.WA', 'WIG20', { mark: 'WIG', market: 'PL', primary: true }],
    ['IMOEX.ME', 'MOEX Russia', { mark: 'MOEX', market: 'RU', primary: true }],
    ['XU100.IS', 'BIST 100', { mark: 'XU', market: 'TR', primary: true }],
    ['^TA125.TA', 'TA-125', { mark: 'TA125', market: 'IL', primary: true }],
    ['^TASI.SR', 'Tadawul All Share', { mark: 'TASI', shortName: 'TASI', market: 'SA', primary: true }],
    // The vendor publishes the Top 40 as a US-dollar net total return series,
    // which is a different number from the rand index of the same name.
    ['^JN0U.JO', 'FTSE/JSE Top 40 (USD)', { mark: 'JSE', shortName: 'JSE Top 40', market: 'ZA', primary: true }],
    ['^JKSE', 'IDX Composite', { mark: 'IDX', market: 'ID', primary: true }],
    ['^KLSE', 'FTSE Bursa Malaysia KLCI', { mark: 'KLCI', shortName: 'KLCI', market: 'MY', primary: true }],
    ['^SET.BK', 'SET Index', { mark: 'SET', shortName: 'SET', market: 'TH', primary: true }],
    ['^NZ50', 'S&P/NZX 50', { mark: 'NZ50', market: 'NZ', primary: true }],
  ]),
  stocks: instruments('stock', [
    ['NVDA', 'NVIDIA'], ['AAPL', 'Apple'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet', { identity: 'alphabet' }],
    ['TSLA', 'Tesla'], ['MSFT', 'Microsoft'], ['AMD', 'Advanced Micro Devices'], ['META', 'Meta Platforms'],
    ['AVGO', 'Broadcom'], ['PLTR', 'Palantir'], ['JPM', 'JPMorgan Chase'], ['WMT', 'Walmart'], ['XOM', 'Exxon Mobil'],
  ]),
  world: instruments('stock', [
    ['TSM', 'Taiwan Semiconductor', { region: 'Taiwan', identity: 'tsmc' }],
    ['ASML', 'ASML', { region: 'Netherlands', identity: 'asml' }],
    ['NVO', 'Novo Nordisk', { region: 'Denmark', identity: 'novonordisk' }],
    ['TM', 'Toyota Motor', { region: 'Japan', identity: 'toyota' }],
    ['SAP', 'SAP', { region: 'Germany', identity: 'sap' }],
    ['BABA', 'Alibaba', { region: 'China', identity: 'alibaba' }],
    ['SONY', 'Sony Group', { region: 'Japan', identity: 'sony' }],
    ['NVS', 'Novartis', { region: 'Switzerland', identity: 'novartis' }],
    ['SHEL', 'Shell', { region: 'UK', identity: 'shell' }],
    ['AZN', 'AstraZeneca', { region: 'UK', identity: 'astrazeneca' }],
    ['HSBC', 'HSBC', { region: 'UK', identity: 'hsbc' }],
    ['INFY', 'Infosys', { region: 'India', identity: 'infosys' }],
    ['RIO', 'Rio Tinto', { region: 'UK', identity: 'riotinto' }],
    ['BHP', 'BHP Group', { region: 'Australia', identity: 'bhp' }],
    ['HDB', 'HDFC Bank', { region: 'India', identity: 'hdfc' }],
    ['SAN', 'Banco Santander', { region: 'Spain', identity: 'santander' }],
    ['SHOP', 'Shopify', { region: 'Canada', identity: 'shopify' }],
    ['SE', 'Sea', { region: 'Singapore', identity: 'sea' }],
    ['MELI', 'MercadoLibre', { region: 'Uruguay', identity: 'mercadolibre' }],
    ['005930.KS', 'Samsung Electronics', { currency: 'KRW', region: 'South Korea', identity: 'samsung' }],
    ['MC.PA', 'LVMH', { currency: 'EUR', region: 'France', identity: 'lvmh' }],
    ['NESN.SW', 'Nestlé', { currency: 'CHF', region: 'Switzerland', identity: 'nestle' }],
  ]),
  crypto: instruments('crypto', [
    ['BTCUSD', 'Bitcoin', { shortName: 'BTC', color: '#f7931a' }], ['ETHUSD', 'Ethereum', { shortName: 'ETH', color: '#627eea' }],
    ['SOLUSD', 'Solana', { shortName: 'SOL', color: '#14b8a6' }], ['BNBUSD', 'BNB', { shortName: 'BNB', color: '#f0b90b' }],
    ['XRPUSD', 'XRP', { shortName: 'XRP' }], ['DOGEUSD', 'Dogecoin', { shortName: 'DOGE' }],
    ['ADAUSD', 'Cardano', { shortName: 'ADA' }], ['LINKUSD', 'Chainlink', { shortName: 'LINK' }],
  ]),
  futures: instruments('future', [
    ['ESUSD', 'S&P 500 futures', { category: 'indices', shortName: 'S&P 500' }],
    ['NQUSD', 'Nasdaq 100 futures', { category: 'indices', shortName: 'Nasdaq 100' }],
    ['YMUSD', 'Dow Jones futures', { category: 'indices', shortName: 'Dow Jones' }],
    ['RTYUSD', 'Russell 2000 futures', { category: 'indices', shortName: 'Russell 2000' }],
    // `summary` marks the six the futures summary compares, as a futures board
    // opens on them: two metals, two more, and the two energy contracts.
    ['GCUSD', 'Gold', { category: 'metals', summary: true }], ['SIUSD', 'Silver', { category: 'metals', summary: true }],
    ['CLUSD', 'WTI crude oil', { category: 'energy', summary: true }], ['BZUSD', 'Brent crude oil', { category: 'energy' }],
    ['NGUSD', 'Natural gas', { category: 'energy', summary: true }], ['RBUSD', 'Gasoline RBOB', { category: 'energy' }],
    ['HOUSD', 'Heating oil', { category: 'energy' }], ['HGUSD', 'Copper', { category: 'metals', summary: true }],
    ['PLUSD', 'Platinum', { category: 'metals', summary: true }], ['PAUSD', 'Palladium', { category: 'metals' }],
    ['ALIUSD', 'Aluminum', { category: 'metals' }], ['ZCUSX', 'Corn', { currency: 'USX', category: 'agriculture' }],
    ['KEUSX', 'Wheat', { currency: 'USX', category: 'agriculture' }], ['ZSUSX', 'Soybeans', { currency: 'USX', category: 'agriculture' }],
    ['KCUSX', 'Coffee', { currency: 'USX', category: 'agriculture' }], ['CCUSD', 'Cocoa', { category: 'agriculture' }],
    ['CTUSX', 'Cotton', { currency: 'USX', category: 'agriculture' }], ['SBUSX', 'Sugar', { currency: 'USX', category: 'agriculture' }],
  ]),
  forex: instruments('forex', [
    ['EURUSD', 'Euro / US Dollar', { shortName: 'EUR/USD', category: 'majors' }],
    ['GBPUSD', 'British Pound / US Dollar', { shortName: 'GBP/USD', category: 'majors' }],
    ['USDJPY', 'US Dollar / Japanese Yen', { shortName: 'USD/JPY', currency: 'JPY', category: 'majors' }],
    ['AUDUSD', 'Australian Dollar / US Dollar', { shortName: 'AUD/USD', category: 'majors' }],
    ['USDCAD', 'US Dollar / Canadian Dollar', { shortName: 'USD/CAD', currency: 'CAD', category: 'majors' }],
    ['USDCHF', 'US Dollar / Swiss Franc', { shortName: 'USD/CHF', currency: 'CHF', category: 'majors' }],
    ['NZDUSD', 'New Zealand Dollar / US Dollar', { shortName: 'NZD/USD', category: 'majors' }],
    ['EURGBP', 'Euro / British Pound', { shortName: 'EUR/GBP', currency: 'GBP', category: 'crosses' }],
    ['EURJPY', 'Euro / Japanese Yen', { shortName: 'EUR/JPY', currency: 'JPY', category: 'crosses' }],
    ['GBPJPY', 'British Pound / Japanese Yen', { shortName: 'GBP/JPY', currency: 'JPY', category: 'crosses' }],
    ['AUDJPY', 'Australian Dollar / Japanese Yen', { shortName: 'AUD/JPY', currency: 'JPY', category: 'crosses' }],
    ['EURCHF', 'Euro / Swiss Franc', { shortName: 'EUR/CHF', currency: 'CHF', category: 'crosses' }],
    ['DXUSD', 'US Dollar Index futures', { shortName: 'US Dollar Index', kind: 'future', category: 'index' }],
  ]),
  bonds: instruments('etf', [
    ['TLT', '20+ Year Treasury Bond ETF'], ['IEF', '7–10 Year Treasury Bond ETF'],
    ['SHY', '1–3 Year Treasury Bond ETF'], ['SGOV', '0–3 Month Treasury Bond ETF'],
    ['TIP', 'Treasury Inflation-Protected Bond ETF'], ['GOVT', 'US Treasury Bond ETF'],
  ]),
  corporate: instruments('etf', [
    ['LQD', 'iShares Investment Grade Corporate Bond', { category: 'investmentGrade' }],
    ['VCIT', 'Vanguard Intermediate-Term Corporate Bond', { category: 'investmentGrade' }],
    ['VCSH', 'Vanguard Short-Term Corporate Bond', { category: 'investmentGrade' }],
    ['USIG', 'iShares Broad USD Investment Grade Corporate Bond', { category: 'investmentGrade' }],
    ['HYG', 'iShares High Yield Corporate Bond', { category: 'highYield' }],
    ['JNK', 'SPDR High Yield Bond', { category: 'highYield' }],
    ['SHYG', 'iShares 0–5 Year High Yield Corporate Bond', { category: 'highYield' }],
    ['SJNK', 'SPDR Short Term High Yield Bond', { category: 'highYield' }],
  ]),
  etfs: instruments('etf', [
    ['SPY', 'SPDR S&P 500 ETF'], ['QQQ', 'Invesco QQQ'], ['IWM', 'iShares Russell 2000'],
    ['VOO', 'Vanguard S&P 500'], ['VTI', 'Vanguard Total Stock Market'], ['GLD', 'SPDR Gold Shares'],
    ['TLT', 'iShares 20+ Year Treasury Bond'], ['HYG', 'iShares High Yield Corporate Bond'],
    ['XLK', 'Technology Select Sector SPDR'], ['XLE', 'Energy Select Sector SPDR'],
    ['SCHD', 'Schwab US Dividend Equity'], ['JEPI', 'JPMorgan Equity Premium Income'],
  ]),
  economy: [],
  // Read from the fund listing rather than shipped: a catalog of "the world's
  // funds" would be a hand-kept opinion, and this section is a ranking.
  worldEtfs: [],
};

/* Indices outside the picker's twenty countries. Identity and region only —
   these are never quoted on their own account. They name and place a row the
   index feed returns; a symbol this list gets wrong simply never matches, and
   the row stays under All indices with the vendor's own name. */
CATALOGS.indices.push(...instruments('index', [
  ['^IPSA', 'S&P/CLX IPSA', { mark: 'IPSA', region: 'americas' }],
  ['^COLCAP', 'COLCAP', { mark: 'COL', region: 'americas' }],
  ['^STOXX50E', 'Euro Stoxx 50', { mark: 'SX5E', region: 'europe' }],
  ['^STOXX', 'Stoxx Europe 600', { mark: 'SXXP', region: 'europe' }],
  ['^PSI20', 'PSI 20', { mark: 'PSI', region: 'europe' }],
  ['^ATG', 'Athens General', { mark: 'ATG', region: 'europe' }],
  ['^ISEQ', 'ISEQ Overall', { mark: 'ISEQ', region: 'europe' }],
  ['^PX', 'PX Prague', { mark: 'PX', region: 'europe' }],
  ['^BUX', 'BUX', { mark: 'BUX', region: 'europe' }],
  ['399001.SZ', 'Shenzhen Component', { mark: 'SZSE', region: 'asia' }],
  ['^KQ11', 'KOSDAQ', { mark: 'KQ', region: 'asia' }],
  ['^AORD', 'All Ordinaries', { mark: 'AORD', region: 'pacific' }],
  ['TA35.TA', 'TA-35', { mark: 'TA35', region: 'middle-east' }],
  ['^DFMGI', 'DFM General', { mark: 'DFM', region: 'middle-east' }],
  ['^CASE30', 'EGX 30', { mark: 'EGX', region: 'africa' }],
]));

const futuresOrder = ['GCUSD', 'SIUSD', 'HGUSD', 'PLUSD', 'CLUSD', 'NGUSD'];
CATALOGS.futures.sort((a, b) => {
  const ai = futuresOrder.indexOf(a.symbol), bi = futuresOrder.indexOf(b.symbol);
  return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi);
});
for (const section of HUB_SECTIONS) section.symbols = CATALOGS[section.id].map((q) => q.symbol);
CATALOGS.indices.forEach((q) => { q.currency = 'POINT'; });

const finite = (x) => x == null || x === '' || typeof x === 'boolean' || !Number.isFinite(Number(x)) ? null : Number(x);
const rows = (r) => r?.status === 'ok' && Array.isArray(r.data) ? r.data : [];
const plainStatus = (r) => ({ status: r?.status || 'error', message: r?.message || '' });
const iso = (days = 0) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const good = (data) => ({ status: 'ok', data });
const failed = (message) => ({ status: 'error', data: [], message });

// Shared across sections, so scrolling rapidly still makes at most four
// hub requests at once. Promise caches also coalesce repeated sections.
let active = 0;
const waiting = [];
function limited(work) {
  return new Promise((resolve) => {
    const run = async () => {
      active += 1;
      try { resolve(await work()); }
      catch (err) { resolve(failed(String(err?.message || err))); }
      finally { active -= 1; waiting.shift()?.(); }
    };
    if (active < 4) run(); else waiting.push(run);
  });
}

const memo = new Map();
let currentKey = null;
function session() {
  const key = getApiKey();
  if (key !== currentKey) { currentKey = key; memo.clear(); }
  return key;
}
function cached(id, work) {
  session();
  const hit = memo.get(id);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.promise;
  const promise = Promise.resolve().then(work).catch((err) => failed(String(err?.message || err)));
  memo.set(id, { at: Date.now(), promise });
  promise.then((result) => {
    const transient = result.status === 'error' || Object.values(result.feeds || {}).some((r) => r.status === 'error');
    if (transient && memo.get(id)?.promise === promise) memo.delete(id);
  });
  return promise;
}
async function quotesFor(symbols) {
  const unique = [...new Set(symbols.filter(Boolean))];
  if (!unique.length) return good([]);
  const jobs = [];
  for (let i = 0; i < unique.length; i += 50) jobs.push(limited(() => fetchBatchQuotes(unique.slice(i, i + 50))));
  const results = await Promise.all(jobs);
  const data = results.flatMap(rows);
  return data.length ? good(data) : results.find((r) => r.status !== 'ok') || good([]);
}
const hub = (kind, params) => limited(() => fetchHubFeed(kind, params));
const market = (kind, params) => limited(() => fetchMarket(kind, params));
const feed = (kind, symbol) => limited(() => fetchFor(kind, symbol));
const calendarFeed = (kind) => cached(`calendar:${kind}:${iso()}`, () => limited(() => fetchCalendar(kind, iso(), iso(14))));
const metas = new Map(Object.values(CATALOGS).flat().map((r) => [r.symbol, r]));

/**
 * Latest quotes for a handful of symbols, as a map.
 *
 * One request per fifty, cached like every other quote read. The news blocks
 * use it to put a real change on a story's ticker chip: the wire tags a story
 * with a symbol and says nothing about what that symbol did.
 */
export async function quoteMap(symbols = []) {
  const unique = [...new Set(symbols.filter(Boolean).map((s) => String(s).toUpperCase()))];
  if (!unique.length || !session()) return new Map();
  const res = await quotesFor(unique);
  return new Map(rows(res).map((r) => [String(r.symbol).toUpperCase(), normalizeHubQuote(r, { kind: 'stock' })]));
}

export function normalizeHubQuote(raw = {}, supplied = {}) {
  const meta = { ...(metas.get(raw.symbol || supplied.symbol) || {}), ...supplied };
  const symbol = String(raw.symbol || meta.symbol || '').toUpperCase();
  const price = finite(raw.price);
  const change = finite(raw.change);
  const previousClose = finite(raw.previousClose);
  const changesPercentage = finite(raw.changePercentage ?? raw.changesPercentage)
    ?? (change != null && previousClose > 0 ? change / previousClose * 100 : null);
  const dayLow = finite(raw.dayLow), dayHigh = finite(raw.dayHigh);
  return {
    ...meta, ...raw, symbol,
    name: raw.name || raw.companyName || meta.name || symbol,
    shortName: meta.shortName || raw.name || raw.companyName || symbol,
    kind: meta.kind || 'stock', currency: meta.kind === 'index' ? 'POINT' : raw.currency || meta.currency || 'USD',
    color: meta.color || '#2962ff', meta,
    price, change, previousClose, changesPercentage, changePercentage: changesPercentage,
    volume: finite(raw.volume), marketCap: finite(raw.marketCap ?? raw.mktCap),
    dayLow, dayHigh, rangePct: dayLow > 0 && dayHigh >= dayLow ? (dayHigh - dayLow) / dayLow * 100 : null,
    employees: finite(raw.employees ?? raw.fullTimeEmployees),
    available: price != null,
  };
}

const usExchange = (r) => /^(NASDAQ|NYSE|AMEX|NYSEARCA|NYSE ARCA|NYSE AMERICAN|BATS|CBOE)(?:\b|$)/i.test(String(r.exchangeShortName || r.exchange || ''));
export function isUSListing(r) {
  const symbol = String(r.symbol || '').toUpperCase();
  if (!/^[A-Z]{1,5}(?:[.-][ABCD])?$/.test(symbol)) return false;
  const exchange = r.exchangeShortName || r.exchange;
  return !exchange || usExchange(r);
}
export function isCommonStock(r) {
  if (r.isEtf === true || r.isFund === true || r.isActivelyTrading === false) return false;
  const name = String(r.name || r.companyName || '');
  const symbol = String(r.symbol || '');
  const localSuffix = COUNTRIES.some(country => country.suffixes.some(suffix => symbol.toUpperCase().endsWith(suffix.toUpperCase())));
  if (/^[A-Z]{4}[RWU]$/.test(symbol) || (!localSuffix && /[.-](?:WS|W|U|R|P[A-Z]?)$/i.test(symbol))) return false;
  return !/\b(?:ETF|ETN|fund|warrants?|rights?|units?|preferred|preference|debentures?|notes?|bonds?|[2-9]x|leveraged|inverse|ProShares|Direxion|GraniteShares|T-REX)\b/i.test(name);
}

const aliases = {
  GOOG: 'alphabet', GOOGL: 'alphabet', 'BRK-A': 'berkshire', 'BRK-B': 'berkshire',
  'BRK.A': 'berkshire', 'BRK.B': 'berkshire', FOX: 'fox', FOXA: 'fox',
  NWS: 'newscorp', NWSA: 'newscorp', 'BF-A': 'brownforman', 'BF-B': 'brownforman',
  'HEI-A': 'heico', HEI: 'heico', 'LEN-B': 'lennar', LEN: 'lennar',
};
function normalizedCompanyName(r) {
  return String(r.name || r.companyName || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(?:class\s+[a-z]|ordinary|common|stock|shares?|american|depositary|depository|receipts?|adr|ads|registered|incorporated|inc|corporation|corp|limited|ltd|plc|s\.?a\.?|se)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function identityTokens(r) {
  const symbol = String(r.symbol || '').toUpperCase();
  const base = !isUSListing(r) ? symbol.replace(/\.[A-Z]{1,4}$/, '') : symbol;
  const knownUS = metas.get(base);
  const variantIdentity = knownUS?.kind === 'stock' && isUSListing(knownUS) ? knownUS.identity || base : null;
  const identity = r.identity || r.meta?.identity || metas.get(symbol)?.identity || aliases[symbol] || variantIdentity;
  const name = normalizedCompanyName(r);
  return [identity && `id:${identity}`, r.cik && `cik:${String(r.cik).replace(/^0+/, '')}`, name && `name:${name}`, `symbol:${symbol}`].filter(Boolean);
}
function preference(r) {
  const symbol = String(r.symbol || '');
  return (usExchange(r) ? 1000 : isUSListing(r) ? 500 : 0)
    + (['GOOGL', 'BRK-B', 'BRK.B', 'FOXA', 'NWSA', 'BF-B', 'HEI', 'LEN'].includes(symbol) ? 30 : 0)
    + (finite(r.volume) > 0 ? Math.log10(Number(r.volume)) : 0);
}
/** One issuer, one listing. US listings win; CIK, issuer identity and cleaned
 * company names also catch alternate tickers and voting/non-voting classes. */
export function dedupeStocks(input, { usOnly = true } = {}) {
  const eligible = input.filter((r) => r?.symbol && isCommonStock(r) && (!usOnly || isUSListing(r)));
  const seen = new Set();
  const chosen = [];
  for (const r of [...eligible].sort((a, b) => preference(b) - preference(a))) {
    const tokens = identityTokens(r);
    if (!tokens.some((token) => seen.has(token))) chosen.push(r);
    tokens.forEach((token) => seen.add(token));
  }
  return chosen;
}

const sorted = (items, metric, direction = -1) => [...items]
  .filter((r) => finite(r[metric]) != null)
  .sort((a, b) => direction * (Number(a[metric]) - Number(b[metric])));
const normalizedRows = (result, kind) => rows(result).map((q) => normalizeHubQuote(q, kind ? { kind } : {}));
function catalogQuotes(id, result) {
  const by = new Map(rows(result).map((q) => [q.symbol, q]));
  return CATALOGS[id].map((meta) => normalizeHubQuote(by.get(meta.symbol) || {}, meta));
}
const localIndices = (code) => CATALOGS.indices.filter((r) => r.market === code);
const worldIndices = (code) => CATALOGS.indices.filter((r) => r.primary && r.market !== code);
/** Placeholder identities for the disconnected page: names and marks with no
 *  values. Nothing is invented for a country whose catalog the hub lacks. */
function placeholderQuotes(id, where) {
  // The country's fund is an identity like its indices are, so the
  // disconnected page names it too — with no values, like everything else here.
  const catalog = id === 'indices' ? [...localIndices(where.code), ...(where.fund ? [where.fund] : [])]
    : ['stocks', 'etfs'].includes(id) && where.code !== 'US' ? [] : CATALOGS[id] || [];
  return catalog.map((meta) => normalizeHubQuote({}, meta));
}
/** Is this row a listing in the selected country? Symbol suffix, exchange or
 *  the provider's own country field — any one of the three is enough. A wrong
 *  entry in the table drops rows rather than admitting another country's. */
function listedIn(country, row) {
  const symbol = String(row.symbol || '').toUpperCase();
  if (country.suffixes.some((suffix) => symbol.endsWith(suffix.toUpperCase()))) return true;
  const exchange = String(row.exchangeShortName || row.exchange || '').toUpperCase();
  if (exchange && country.exchanges.some((name) => exchange === name || exchange.startsWith(`${name} `))) return true;
  return String(row.country || '').toUpperCase() === country.code;
}
function assemble(id, feeds, data, notes = []) {
  const failures = Object.values(feeds).filter((r) => r.status !== 'ok');
  const anyGood = Object.values(feeds).some((r) => r.status === 'ok');
  const status = anyGood ? 'ok' : failures.find((r) => r.status === 'error')?.status || failures[0]?.status || 'ok';
  const listStatus = Object.fromEntries(HUB_SECTIONS.find((s) => s.id === id).tabs.map((tab) => [tab.id, { status }]));
  return {
    status, message: anyGood ? '' : failures.find((r) => r.message)?.message || '',
    data: { quotes: [], lists: {}, listStatus, ...data }, notes,
    feeds: Object.fromEntries(Object.entries(feeds).map(([k, r]) => [k, plainStatus(r)])),
  };
}

export async function loadHubSection(id, { country = DEFAULT_COUNTRY, refresh = false, usSeries = true } = {}) {
  const spec = HUB_SECTIONS.find((s) => s.id === id);
  if (!spec) return failed(`Unknown market section: ${id}`);
  const where = countryOf(country);
  // A global or US-only section is fetched once, not once per country. The
  // economy section is cached twice for one country — with the US series and
  // without — because the World Economy page shows them and a country's own
  // section does not, and a shared key would make one pay for the other.
  const key = `section:${id}:${spec.scope === 'country' ? where.code : spec.scope}${id === 'economy' && !usSeries ? ':local' : ''}`;
  if (!session()) return {
    status: 'skipped', message: 'Connect your FMP API key in Settings to load market data.', notes: [], feeds: {},
    data: { quotes: placeholderQuotes(id, where), lists: {}, listStatus: Object.fromEntries(spec.tabs.map((p) => [p.id, { status: 'skipped' }])),
      worldIndices: id === 'indices' ? worldIndices(where.code).map((meta) => normalizeHubQuote({}, meta)) : [],
      earnings: [], ipos: [], curve: [], indicators: [], calendar: [] },
  };
  if (refresh) memo.delete(key);
  return cached(key, () => LOADERS[id](where, { usSeries }));
}

/* ---------- the Market Indices board ------------------------------------- */

/** The tables behind Market Indices, in the order the page shows them. */
export const INDEX_BOARDS = [
  { id: 'all', label: 'All indices' },
  { id: 'major', label: 'Major world indices' },
  { id: 'us', label: 'US indices' },
  { id: 'sectors', label: 'S&P sectors' },
  { id: 'currencies', label: 'Currency indices' },
  { id: 'americas', label: 'Americas', region: 'americas' },
  { id: 'europe', label: 'Europe', region: 'europe' },
  { id: 'asia', label: 'Asia', region: 'asia' },
  { id: 'pacific', label: 'Pacific', region: 'pacific' },
  { id: 'middle-east', label: 'Middle East', region: 'middle-east' },
  { id: 'africa', label: 'Africa', region: 'africa' },
];

/* Where a listing trades, read off the symbol. The index feed carries no
   country, so a suffix is the only thing a row the catalog has never heard of
   brings with it. No suffix and no catalog entry means no region, and the row
   appears under All indices alone rather than in a region it might not be in. */
const SUFFIX_REGIONS = {
  americas: ['.TO', '.V', '.SA', '.MX', '.BA', '.SN'],
  europe: ['.L', '.DE', '.F', '.PA', '.AS', '.BR', '.MC', '.MI', '.SW', '.ST', '.CO', '.HE', '.OL', '.VI', '.WA', '.LS', '.AT', '.IR', '.IS', '.PR', '.BD', '.IC', '.ME'],
  asia: ['.SS', '.SZ', '.HK', '.KS', '.KQ', '.T', '.TW', '.TWO', '.NS', '.BO', '.JK', '.KL', '.BK', '.SI'],
  pacific: ['.AX', '.NZ'],
  'middle-east': ['.TA', '.SR', '.QA', '.AE'],
  africa: ['.JO', '.CA', '.NG'],
};
function regionOf(row) {
  if (row.region) return row.region;
  if (row.market) return countryOf(row.market).region;
  const symbol = String(row.symbol || '').toUpperCase();
  const dot = symbol.lastIndexOf('.');
  if (dot < 0) return null;
  const suffix = symbol.slice(dot);
  return Object.keys(SUFFIX_REGIONS).find((region) => SUFFIX_REGIONS[region].includes(suffix)) || null;
}
export const CURRENCY_INDICES = ['DXUSD', '^DXY', '^NZDX', '^EURX'];

/* The performance windows FMP's price-change feed returns, in board order.
   `key` is the vendor's field; `label` is the window a reader recognises. */
export const PRICE_CHANGE_COLUMNS = [
  { key: '5D', label: '1W' }, { key: '1M', label: '1M' }, { key: '3M', label: '3M' },
  { key: '6M', label: '6M' }, { key: 'ytd', label: 'YTD' }, { key: '1Y', label: '1Y' },
  { key: '5Y', label: '5Y' }, { key: '10Y', label: '10Y' }, { key: 'max', label: 'All' },
];

/** One price-change request per index, capped and cached like every other
 *  feed here. Returns a map of symbol to its windows, or to why it has none. */
export async function loadPriceChanges(symbols, onProgress) {
  const out = new Map();
  let done = 0;
  await Promise.all([...new Set(symbols)].map(async (symbol) => {
    const res = await cached(`performance:${symbol}`, () => hub('priceChanges', { symbol }));
    const row = rows(res).find((r) => r && (r.symbol === symbol || r['1M'] != null)) || null;
    out.set(symbol, row
      ? { status: 'ok', values: Object.fromEntries(PRICE_CHANGE_COLUMNS.map((c) => [c.key, finite(row[c.key])])) }
      : { status: res.status === 'ok' ? 'unavailable' : res.status, message: res.message || '', values: null });
    onProgress?.(++done, symbols.length);
  }));
  return out;
}

/** One index feed, one sector snapshot, and the benchmarks the feed missed. */
export async function loadIndexBoard({ refresh = false } = {}) {
  const key = 'board:indices';
  if (!session()) return {
    status: 'skipped', message: 'Connect your FMP API key in Settings to load market data.', notes: [], feeds: {},
    data: { rows: CATALOGS.indices.filter((meta) => meta.market).map((meta) => ({ ...normalizeHubQuote({}, meta), region: regionOf(meta) })), sectors: [], sectorStatus: { status: 'skipped' } },
  };
  if (refresh) memo.delete(key);
  return cached(key, async () => {
    const [feed, sectors, currencies] = await Promise.all([hub('indices', { short: false }), market('sectorPerf'), quotesFor(CURRENCY_INDICES)]);
    const by = new Map();
    for (const raw of [...rows(feed), ...rows(currencies)]) {
      const symbol = String(raw.symbol || '').toUpperCase();
      if (!symbol || by.has(symbol)) continue;
      const meta = metas.get(symbol);
      by.set(symbol, normalizeHubQuote({ ...raw, name: meta?.name || raw.name }, { ...(meta || {}), kind: 'index' }));
    }
    // Benchmarks this app names but the feed did not return, quoted directly so
    // the country boards are not at the mercy of one feed's coverage.
    const missing = CATALOGS.indices.filter((meta) => meta.market && !by.has(meta.symbol));
    const extra = missing.length ? await quotesFor(missing.map((meta) => meta.symbol)) : good([]);
    const quoted = new Map(rows(extra).map((raw) => [raw.symbol, raw]));
    for (const meta of missing) by.set(meta.symbol, normalizeHubQuote({ ...(quoted.get(meta.symbol) || {}), name: meta.name }, meta));
    const all = [...by.values()].map((row) => ({ ...row, region: regionOf(row) }))
      .sort((a, b) => Number(b.available) - Number(a.available) || String(a.name).localeCompare(String(b.name)));
    const sectorRows = rows(sectors).map((r) => ({
      symbol: r.sector, name: r.sector, shortName: r.sector, kind: 'index', mark: String(r.sector || '').slice(0, 3).toUpperCase(),
      exchange: r.exchange, date: r.date, changesPercentage: finite(r.averageChange), price: null, available: false,
    }));
    return assemble('indices', { indices: feed, sectors, currencies, missing: extra }, {
      rows: all, sectors: sectorRows, sectorStatus: plainStatus(sectors),
      currencyStatus: plainStatus(currencies),
    }, ['Every index FMP returns from its index feed, with the benchmarks this app names quoted directly when the feed omits one.',
      'A region table holds the rows this page can place by catalog entry or listing suffix; anything else stays under All indices.',
      'FMP supplies no technical ratings or realised volatility for an index, so those two columns are absent rather than estimated.']);
  });
}

/* ---------- the futures board ---------------------------------------------

   `commodities-list` names every contract FMP carries and `batch-commodity-
   quotes` prices them — forty in all, which is the whole board. The groups are
   this table's: the feed carries no category, and the collections a futures
   board is read by (agricultural, energy, currencies, metals, index, rates)
   are conventional rather than something a vendor publishes. A contract this
   table has never heard of still appears under All futures; it is simply not
   filed under a collection it might not belong to. */
export const FUTURES_BOARDS = [
  { id: 'all', label: 'All futures' },
  { id: 'agricultural', label: 'Agricultural', group: 'agricultural' },
  { id: 'energy', label: 'Energy', group: 'energy' },
  { id: 'currencies', label: 'Currencies', group: 'currencies' },
  { id: 'metals', label: 'Metals', group: 'metals' },
  { id: 'indices', label: 'World indices', group: 'indices' },
  { id: 'rates', label: 'Interest rates', group: 'rates' },
];
const FUTURES_GROUPS = {
  rates: ['ZQUSD', 'ZTUSD', 'ZFUSD', 'ZNUSD', 'ZBUSD'],
  indices: ['ESUSD', 'NQUSD', 'YMUSD', 'RTYUSD'],
  currencies: ['DXUSD'],
  metals: ['GCUSD', 'MGCUSD', 'SIUSD', 'SILUSD', 'PLUSD', 'PAUSD', 'HGUSD', 'ALIUSD'],
  energy: ['CLUSD', 'BZUSD', 'NGUSD', 'RBUSD', 'HOUSD'],
  agricultural: ['ZCUSX', 'ZSUSX', 'ZMUSD', 'ZLUSX', 'ZOUSX', 'ZRUSD', 'KEUSX', 'KCUSX', 'CCUSD', 'CTUSX',
    'SBUSX', 'OJUSX', 'LEUSX', 'GFUSX', 'HEUSX', 'DCUSD', 'LBUSD'],
};
const futuresGroupOf = (symbol) => Object.keys(FUTURES_GROUPS).find((group) => FUTURES_GROUPS[group].includes(symbol)) || null;

/** Every contract FMP quotes, with the name and delivery month it lists. */
export async function loadFuturesBoard({ refresh = false } = {}) {
  const key = 'board:futures';
  if (!session()) return {
    status: 'skipped', message: 'Connect your FMP API key in Settings to load market data.', notes: [], feeds: {},
    data: { rows: CATALOGS.futures.map((meta) => ({ ...normalizeHubQuote({}, meta), group: futuresGroupOf(meta.symbol) })) },
  };
  if (refresh) memo.delete(key);
  return cached(key, async () => {
    const [quotes, list] = await Promise.all([hub('commodities', { short: false }), hub('commoditiesList')]);
    const listed = new Map(rows(list).map((row) => [String(row.symbol || '').toUpperCase(), row]));
    const by = new Map();
    for (const raw of rows(quotes)) {
      const symbol = String(raw.symbol || '').toUpperCase();
      if (!symbol || by.has(symbol)) continue;
      const meta = metas.get(symbol);
      const catalogued = listed.get(symbol) || {};
      by.set(symbol, {
        ...normalizeHubQuote({ ...raw, name: meta?.name || catalogued.name || raw.name }, { ...(meta || {}), kind: 'future' }),
        group: futuresGroupOf(symbol), tradeMonth: catalogued.tradeMonth || null,
        currency: catalogued.currency || meta?.currency || raw.currency || 'USD',
      });
    }
    // A contract the list names but the quote feed skipped still belongs here.
    for (const [symbol, row] of listed) {
      if (by.has(symbol)) continue;
      const meta = metas.get(symbol);
      by.set(symbol, {
        ...normalizeHubQuote({ name: meta?.name || row.name }, { ...(meta || {}), symbol, kind: 'future' }),
        group: futuresGroupOf(symbol), tradeMonth: row.tradeMonth || null, currency: row.currency || 'USD',
      });
    }
    const all = [...by.values()].sort((a, b) => Number(b.available) - Number(a.available) || String(a.name).localeCompare(String(b.name)));
    return assemble('futures', { quotes, list }, { rows: all }, [
      `Every contract FMP lists, ${all.length} in all, priced from its commodity quote feed. Prices are the vendor's continuous front-month series; USX denotes US cents.`,
      'Collections are this app\u2019s: the feed carries no category. A contract it cannot place stays under All futures.',
      'FMP supplies no technical rating for a contract, so that column is absent rather than estimated.',
    ]);
  });
}

/* ---------- index news ---------------------------------------------------

   FMP tags news by company, never by index, and no feed here carries an index
   story as such. The market-wide firehose does carry them, so the board keeps
   the stories whose headline or summary names an index it tracks, marks each
   one with the indices it named, and prints that rule rather than implying a
   curated index wire. The country picker is not consulted: an index story is
   an index story wherever it was written.

   A term under six characters is dropped unless it is on this list, because a
   three-letter index abbreviation matches half the language. Dropping one
   costs the section a few stories; keeping it would file a story about a set
   under a stock index. */
const NEWS_ALIASES = {
  '^GSPC': ['S&P 500', 'SPX'], '^IXIC': ['Nasdaq Composite', 'Nasdaq'], '^NDX': ['Nasdaq 100', 'Nasdaq-100'],
  '^DJI': ['Dow Jones', 'Dow 30', 'the Dow'], '^RUT': ['Russell 2000', 'Russell'], '^VIX': ['VIX', 'volatility index'],
  '^NYA': ['NYSE Composite'], '^OEX': ['S&P 100'], '^MID': ['S&P MidCap 400'], '^SML': ['S&P SmallCap 600'],
  '^DJT': ['Dow Jones Transportation'], '^DJU': ['Dow Jones Utilities'],
  '^GSPTSE': ['S&P/TSX', 'TSX Composite'], '^BVSP': ['Ibovespa', 'Bovespa'], '^MXX': ['S&P/BMV', 'Mexican IPC'],
  '^FTSE': ['FTSE 100'], '^FTMC': ['FTSE 250'], '^GDAXI': ['DAX'], '^MDAXI': ['MDAX'], '^FCHI': ['CAC 40'],
  '^AEX': ['AEX index'], '^SSMI': ['Swiss Market Index', 'SMI index'], '^IBEX': ['IBEX 35'], 'FTSEMIB.MI': ['FTSE MIB'],
  '^OMX': ['OMX Stockholm'], '^N225': ['Nikkei'], '000001.SS': ['Shanghai Composite', 'SSE Composite'],
  '^HSI': ['Hang Seng'], '^BSESN': ['Sensex'], '^NSEI': ['Nifty'], '^KS11': ['Kospi'], '^KQ11': ['Kosdaq'],
  '^TWII': ['Taiex'], '^STI': ['Straits Times'], '^AXJO': ['ASX 200', 'S&P/ASX'], '^AORD': ['All Ordinaries'],
  '^NZ50': ['NZX 50'], '^STOXX50E': ['Euro Stoxx', 'Stoxx 50'], '^STOXX': ['Stoxx Europe'], '^XU100': ['BIST 100'],
  '^WIG20': ['WIG20'], '^TASI': ['Tadawul'], 'TA35.TA': ['TA-35'], '^DFMGI': ['DFM General'],
  '^JN0U.JO': ['JSE Top 40'], '^CASE30': ['EGX 30'], '^JKSE': ['IDX Composite', 'Jakarta Composite'], '^KLSE': ['KLCI'],
};
/* Contract names as a headline writes them. Gold is the reason the boundary
   test is what it is: `Goldman` must not be a gold story, and a term followed
   by a letter is not a match. `oil` on its own is too broad to use — a story
   about an oil company is not a story about the crude contract — so the term
   is the contract's own name. */
const FUTURES_NEWS_ALIASES = {
  GCUSD: ['gold', 'bullion'], SIUSD: ['silver'], HGUSD: ['copper'], PLUSD: ['platinum'], PAUSD: ['palladium'],
  ALIUSD: ['aluminum', 'aluminium'], CLUSD: ['crude oil', 'WTI', 'crude'], BZUSD: ['Brent'],
  NGUSD: ['natural gas'], RBUSD: ['gasoline', 'RBOB'], HOUSD: ['heating oil'],
  ZCUSX: ['corn'], KEUSX: ['wheat'], ZSUSX: ['soybean', 'soybeans'], KCUSX: ['coffee'], CCUSD: ['cocoa'],
  CTUSX: ['cotton'], SBUSX: ['sugar'],
  ESUSD: ['S&P 500 futures', 'E-mini'], NQUSD: ['Nasdaq futures', 'Nasdaq 100 futures'],
  YMUSD: ['Dow futures'], RTYUSD: ['Russell 2000 futures'],
};
/* Funds as a headline names them. No ticker is on this list: `SPY` is three
   letters that occur in half the language once the match is case-insensitive.
   The stock wire tags a story with the symbol it is about, which is the exact
   version of the same question, so the guessing is left to the long names. */
const ETF_NEWS_ALIASES = {
  SPY: ['SPDR S&P 500', 'S&P 500 ETF'], QQQ: ['Invesco QQQ', 'Nasdaq 100 ETF'],
  IWM: ['iShares Russell 2000', 'Russell 2000 ETF'], VOO: ['Vanguard S&P 500'],
  VTI: ['Vanguard Total Stock Market'], GLD: ['SPDR Gold', 'gold ETF'],
  TLT: ['iShares 20+ Year Treasury', 'long-dated Treasury ETF'],
  HYG: ['iShares High Yield', 'high-yield bond ETF'],
  XLK: ['Technology Select Sector'], XLE: ['Energy Select Sector'],
  SCHD: ['Schwab US Dividend Equity'], JEPI: ['JPMorgan Equity Premium Income'],
};
const matcherCache = new Map();
/** One regexp per term, built once per catalog and reused by every scan. */
function matchersFor(kind) {
  if (matcherCache.has(kind)) return matcherCache.get(kind);
  const built = [];
  const catalog = CATALOGS[kind] || CATALOGS.indices;
  const aliases = kind === 'futures' ? FUTURES_NEWS_ALIASES : kind === 'etfs' ? ETF_NEWS_ALIASES : NEWS_ALIASES;
  for (const meta of catalog) {
    const terms = aliases[meta.symbol] || (kind !== 'futures' && String(meta.name).length >= 6 ? [meta.name] : []);
    for (const term of terms) {
      built.push({ meta, re: new RegExp(`(?:^|[^A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i') });
    }
  }
  matcherCache.set(kind, built);
  return built;
}

/* Which wires a board reads. An index or a contract is never a company, so
   those two have only the market-wide firehose to scan. A fund *is* a listed
   symbol, so the ETF page also reads the stock wire, where the vendor has
   already tagged each story with the symbol it is about. */
const NEWS_WIRES = { indices: ['general'], futures: ['general'], etfs: ['general', 'stock'] };
const NEWS_SUBJECT = {
  indices: { noun: 'index', subject: 'an index' },
  futures: { noun: 'contract', subject: 'a contract' },
  etfs: { noun: 'fund', subject: 'a fund' },
};

/** Market-wide stories that name something this board tracks, newest first.
 *  Two requests a wire, and the same ones for every board: the feed is cached. */
async function marketNews(kind, { refresh = false } = {}) {
  const key = `news:${kind}`;
  if (!session()) return {
    status: 'skipped', message: 'Connect your FMP API key in Settings to load market news.', notes: [], feeds: {},
    data: { articles: [], scanned: 0 },
  };
  if (refresh) memo.delete(key);
  return cached(key, async () => {
    const wires = NEWS_WIRES[kind] || ['general'];
    const pages = await Promise.all(wires.flatMap((wire) => [0, 1].map((page) =>
      limited(() => fetchNewsFeed(wire, { limit: 100, page })))));
    // The vendor's own tag, where there is one: a fund is a symbol it files
    // stories under, and a tag beats any rule this app could write.
    const tagged = kind === 'etfs' ? new Map(CATALOGS.etfs.map((meta) => [meta.symbol, meta])) : null;
    const seen = new Set();
    const articles = [];
    let tags = 0;
    for (const res of pages) {
      for (const raw of rows(res)) {
        const title = String(raw.title || '').trim();
        const url = String(raw.url || '');
        const id = url || title.toLowerCase();
        if (!title || seen.has(id)) continue;
        seen.add(id);
        const hit = tagged?.get(String(raw.symbol || '').trim().toUpperCase());
        const named = matchersFor(kind).filter((m) => m.re.test(`${title} ${String(raw.text || raw.content || '').slice(0, 500)}`));
        if (!hit && !named.length) continue;
        if (hit) tags += 1;
        articles.push({
          title, url: url || null, date: raw.publishedDate || raw.date || null,
          source: raw.publisher || raw.site || '', site: raw.site || null,
          // The summary and the picture are the publisher's own, and the news
          // page prints both; a board shows neither and ignores them.
          text: String(raw.text || raw.content || '').replace(/\s+/g, ' ').trim().slice(0, 320),
          image: raw.image || null,
          indices: [...new Map([...(hit ? [hit] : []), ...named.map((m) => m.meta)].map((meta) => [meta.symbol, meta])).values()].slice(0, 4),
        });
      }
    }
    articles.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const { noun, subject } = NEWS_SUBJECT[kind] || NEWS_SUBJECT.indices;
    return assemble(kind, Object.fromEntries(pages.map((res, index) => [`news${index}`, res])), { articles, scanned: seen.size }, [
      kind === 'etfs'
        ? `FMP files a story under the company or fund it is about, so this is the market-wide and stock wires kept to stories tagged with, or naming, one of the ${tagged.size} US funds this page tracks: ${articles.length} of the ${seen.size} latest stories, ${tags} of them by the vendor's own tag. The marks on a story are the funds it named.`
        : `FMP tags news by company and never by ${noun}, so this is the market-wide feed filtered to stories that name ${subject} this board tracks: ${articles.length} of the ${seen.size} latest stories. The marks on a story are what it named.`,
      'Headlines are the publisher\'s own words and open on the publisher\'s site. Nothing here is ranked, scored or sentiment-tagged.',
    ]);
  });
}
export const loadIndexNews = (options) => marketNews('indices', options);
export const loadFuturesNews = (options) => marketNews('futures', options);
export const loadEtfNews = (options) => marketNews('etfs', options);

async function loadIndices(country) {
  const local = localIndices(country.code);
  const abroad = worldIndices(country.code);
  // The country's own fund rides in the same batch as its indices: one more
  // symbol on a request already being made, rather than a request of its own.
  const fund = country.fund ? [country.fund] : [];
  const res = await quotesFor([...local, ...abroad, ...fund].map((q) => q.symbol));
  const by = new Map(rows(res).map((q) => [q.symbol, q]));
  const shape = (catalog) => catalog.map((meta) => normalizeHubQuote(by.get(meta.symbol) || {}, meta));
  const funds = shape(fund).filter((q) => q.available);
  const quotes = [...shape(local), ...funds];
  const world = shape(abroad).filter((q) => q.available);
  return assemble('indices', { quotes: res }, {
    quotes, worldIndices: world, funds,
    lists: { home: quotes.filter((q) => q.available), world },
  }, [local.length
    ? `Benchmark indices for ${country.name}, with one benchmark for each other country in the picker. Index levels are points, not a currency.`
    : `FMP publishes no index for ${country.name}, so this section carries the world benchmarks and whatever fund tracks the market. Index levels are points, not a currency.`,
    ...(funds.length ? [`${funds[0].name} (${funds[0].symbol}) is the US-listed fund that tracks this market, quoted in dollars. A fund's price is not the index level, and an unhedged fund also carries the currency.`] : [])]);
}

const US_SCREEN = { exchange: 'NASDAQ,NYSE,AMEX', isEtf: false, isFund: false, isActivelyTrading: true, includeAllShareClasses: false };
const companyUniverse = () => cached('us-large-companies', () => limited(() => fetchScreener({ ...US_SCREEN, marketCapMoreThan: 100e9, limit: 200 })));

async function loadStocks(country) {
  return country.movers ? loadUSStocks() : loadCountryStocks(country);
}

const countryUniverse = (country) => cached(`universe:${country.code}`, () => limited(() => fetchScreener({
  country: country.code, isEtf: false, isFund: false, isActivelyTrading: true,
  includeAllShareClasses: false, marketCapMoreThan: 5e8, limit: 250,
})));

/** Outside the United States there is no whole-market mover feed at FMP, so
 *  the rankings are computed over the largest listings its screener returns
 *  for the country. The section prints that universe rather than implying it
 *  ranked every listing on the exchange. */
async function loadCountryStocks(country) {
  const [universe, earningsFeed, iposFeed] = await Promise.all([
    countryUniverse(country), calendarFeed('earnings'), hub('ipos', { from: iso(), to: iso(14) }),
  ]);
  const listed = sorted(dedupeStocks(rows(universe), { usOnly: false }).map((r) => normalizeHubQuote(r)), 'marketCap').slice(0, 120);
  const calendarCandidates = rows(earningsFeed).filter((r) => r.symbol && isCommonStock(r) && listedIn(country, r))
    .sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 60);
  const quoteFeed = await quotesFor([...listed.map((r) => r.symbol), ...calendarCandidates.map((r) => r.symbol)]);
  const byQuote = new Map(rows(quoteFeed).map((r) => [r.symbol, r]));
  const traded = listed.filter((r) => byQuote.has(r.symbol)).map((r) => normalizeHubQuote({ ...r, ...byQuote.get(r.symbol) }));
  const earnings = dedupeStocks(calendarCandidates.map((r) => ({ ...r, kind: 'stock',
    name: byQuote.get(r.symbol)?.name || r.name || r.symbol, exchange: byQuote.get(r.symbol)?.exchange })), { usOnly: false })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const ipos = dedupeStocks(rows(iposFeed).map((r) => ({ ...r, name: r.company || r.companyName || r.name || r.symbol })), { usOnly: false })
    .filter((r) => listedIn(country, r)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const empty = universe.status === 'ok'
    ? { status: 'unavailable', message: `FMP's screener returned no listings in ${country.name} to rank.` }
    : plainStatus(universe);
  const listStatus = traded.length ? plainStatus(quoteFeed) : empty;
  return assemble('stocks', { universe, quotes: quoteFeed, earnings: earningsFeed, ipos: iposFeed }, {
    quotes: traded.slice(0, 12), earnings, ipos,
    lists: {
      volume: sorted(traded, 'volume'), volatility: sorted(traded, 'rangePct'),
      gainers: sorted(traded.filter((r) => r.changesPercentage > 0), 'changesPercentage'),
      losers: sorted(traded.filter((r) => r.changesPercentage < 0), 'changesPercentage', 1),
    },
    listStatus: { volume: listStatus, volatility: listStatus, gainers: listStatus, losers: listStatus },
    earningsStatus: plainStatus(earningsFeed), iposStatus: plainStatus(iposFeed),
  }, [`FMP publishes whole-market gainer, loser and most-active feeds for US exchanges only. These rankings cover the ${traded.length} largest listings in ${country.name} that its screener returns, one per issuer, ranked on the latest quotes.`,
    `A calendar row is kept when its exchange, symbol suffix or country field matches ${country.name}.`]);
}

async function loadUSStocks() {
  const from = iso(), to = iso(14);
  const [activeFeed, gainersFeed, losersFeed, earningsFeed, iposFeed] = await Promise.all([
    market('active'), market('gainers'), market('losers'),
    calendarFeed('earnings'), hub('ipos', { from, to }),
  ]);
  const initial = dedupeStocks([...rows(activeFeed), ...rows(gainersFeed), ...rows(losersFeed)].map((r) => normalizeHubQuote(r)));
  // Enrich the ranking candidates in batches with the exchange, volume and
  // intraday high/low missing from the mover feeds. Calendars are bounded too.
  const calendarCandidates = rows(earningsFeed).filter(isUSListing).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 60);
  const quoteFeed = await quotesFor([...CATALOGS.stocks.map((r) => r.symbol), ...initial.slice(0, 120).map((r) => r.symbol), ...calendarCandidates.map((r) => r.symbol)]);
  const byQuote = new Map(rows(quoteFeed).map((r) => [r.symbol, r]));
  const enrich = (input) => dedupeStocks(input.map((r) => normalizeHubQuote({ ...r, ...(byQuote.get(r.symbol) || {}) })))
    .filter((r) => byQuote.has(r.symbol) && usExchange(r));
  const all = enrich(initial);
  const activeRows = enrich(rows(activeFeed));
  const gainers = enrich(rows(gainersFeed)).filter((r) => r.changesPercentage > 0);
  const losers = enrich(rows(losersFeed)).filter((r) => r.changesPercentage < 0);
  const earnings = dedupeStocks(calendarCandidates.filter((r) => {
    const q = byQuote.get(r.symbol); return q && usExchange(q) && isCommonStock(q);
  }).map((r) => ({ ...r, exchange: byQuote.get(r.symbol)?.exchange, name: byQuote.get(r.symbol)?.name || r.symbol, kind: 'stock' })))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const ipos = dedupeStocks(rows(iposFeed).map((r) => ({ ...r, name: r.company || r.companyName || r.name || r.symbol })))
    .filter((r) => usExchange(r)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return assemble('stocks', { quotes: quoteFeed, active: activeFeed, gainers: gainersFeed, losers: losersFeed, earnings: earningsFeed, ipos: iposFeed }, {
    quotes: catalogQuotes('stocks', quoteFeed), earnings, ipos,
    lists: { volume: sorted(activeRows, 'volume'), volatility: sorted(all, 'rangePct'), gainers: sorted(gainers, 'changesPercentage'), losers: sorted(losers, 'changesPercentage', 1) },
    listStatus: { volume: plainStatus(activeFeed), volatility: plainStatus(quoteFeed), gainers: plainStatus(gainersFeed), losers: plainStatus(losersFeed) },
    earningsStatus: plainStatus(earningsFeed), iposStatus: plainStatus(iposFeed),
  }, ['US exchange listings, one listing per company. Volatility is the intraday high–low range as a percentage of the low, ranked within the active and mover lists.']);
}

async function loadWorld() {
  const [universe, worldQuotes, fx, earningsFeed, iposFeed] = await Promise.all([
    companyUniverse(), quotesFor(CATALOGS.world.map((r) => r.symbol)), quotesFor(['USDKRW', 'EURUSD', 'USDCHF']),
    calendarFeed('earnings'), hub('ipos', { from: iso(), to: iso(14) }),
  ]);
  const fxMap = new Map(rows(fx).map((r) => [r.symbol, finite(r.price)]));
  const toUSD = (row) => {
    const r = normalizeHubQuote(row);
    const nativeCap = r.marketCap;
    const rate = r.currency === 'USD' ? 1 : r.currency === 'EUR' ? fxMap.get('EURUSD')
      : r.currency === 'KRW' && fxMap.get('USDKRW') > 0 ? 1 / fxMap.get('USDKRW')
        : r.currency === 'CHF' && fxMap.get('USDCHF') > 0 ? 1 / fxMap.get('USDCHF') : null;
    return { ...r, nativeMarketCap: nativeCap, marketCap: nativeCap != null && rate > 0 ? nativeCap * rate : null, marketCapCurrency: 'USD' };
  };
  const worldSymbols = new Set(CATALOGS.world.map((r) => r.symbol));
  const domestic = dedupeStocks(rows(universe), { usOnly: true });
  const international = rows(worldQuotes).filter((r) => worldSymbols.has(r.symbol));
  const largest = sorted(dedupeStocks([...domestic, ...international].map(toUSD), { usOnly: false }), 'marketCap');
  const employeeSymbols = ['WMT', 'AMZN', 'ACN', 'UPS', 'FDX', 'HD', 'TGT', 'COST', 'IBM', 'KR', 'TM', 'INFY', 'HSBC', 'SONY', 'TSM', '005930.KS', 'NESN.SW'];
  const calendarCandidates = rows(earningsFeed).filter((r) => r.symbol && isCommonStock(r))
    .sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 80);
  const [profiles, calendarQuotes] = await Promise.all([
    Promise.all(employeeSymbols.map((symbol) => feed('profile', symbol))),
    quotesFor(calendarCandidates.map((r) => r.symbol)),
  ]);
  const quoteMap = new Map(rows(calendarQuotes).map((q) => [q.symbol, q]));
  const earnings = dedupeStocks(calendarCandidates.filter((r) => {
    const q = quoteMap.get(r.symbol); return q && isCommonStock(q) && !/^(ETF|MUTUAL_FUND|INDEX|CRYPTO|FOREX|COMMODITY)$/i.test(q.exchange || '');
  }).map((r) => ({ ...r, name: quoteMap.get(r.symbol)?.name || r.symbol, exchange: quoteMap.get(r.symbol)?.exchange, kind: 'stock' })), { usOnly: false })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const ipos = dedupeStocks(rows(iposFeed).map((r) => ({ ...r, name: r.company || r.companyName || r.name || r.symbol })), { usOnly: false })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const employers = profiles.flatMap((r, i) => r.status === 'ok' && r.data ? [normalizeHubQuote({ ...r.data, symbol: employeeSymbols[i] })] : []);
  return assemble('world', { companies: universe, quotes: worldQuotes, ...Object.fromEntries(profiles.map((r, i) => [`profile:${employeeSymbols[i]}`, r])), fx, earnings: earningsFeed, ipos: iposFeed, calendarQuotes }, {
    quotes: catalogQuotes('world', worldQuotes), earnings, ipos, earningsStatus: plainStatus(earningsFeed), iposStatus: plainStatus(iposFeed),
    lists: { largest, employers: sorted(dedupeStocks(employers, { usOnly: false }), 'employees') },
    listStatus: { largest: plainStatus(universe.status === 'ok' ? universe : worldQuotes), employers: plainStatus(profiles.find((r) => r.status === 'ok') || profiles[0]) },
  }, ['Selected leading US and international companies. US listings and ADRs are preferred; other firms appear once on their primary listing. Market caps are in USD, converted at the latest available FX rate. Employer ranking covers selected large employers; reporting dates vary.']);
}

async function loadCrypto() {
  const res = await hub('crypto', { short: false });
  const unique = new Map();
  for (const r of normalizedRows(res, 'crypto')) {
    if (/USD$/.test(r.symbol) && r.price != null && !unique.has(r.symbol)) unique.set(r.symbol, r);
  }
  const all = [...unique.values()];
  return assemble('crypto', { quotes: res }, { quotes: catalogQuotes('crypto', res), lists: {
    marketCap: sorted(all.filter((r) => r.marketCap > 0), 'marketCap'), tvl: [],
    gainers: sorted(all.filter((r) => r.changesPercentage > 0), 'changesPercentage'),
    losers: sorted(all.filter((r) => r.changesPercentage < 0), 'changesPercentage', 1),
  }, listStatus: { marketCap: plainStatus(res), tvl: { status: 'unavailable', message: 'FMP does not provide DeFi total value locked. TVL rankings are unavailable with this data source.' }, gainers: plainStatus(res), losers: plainStatus(res) } }, ['USD cryptocurrency pairs from FMP. DeFi total value locked is not supplied by this data source.']);
}

async function loadFutures() {
  const res = await hub('commodities', { short: false });
  const quotes = catalogQuotes('futures', res);
  return assemble('futures', { quotes: res }, { quotes, lists: Object.fromEntries(['energy', 'metals', 'agriculture', 'indices'].map((id) => [id, quotes.filter((q) => q.available && q.category === id)])) },
    ['FMP futures symbols; prices reflect the contract supplied by FMP. USX denotes US cents, USD denotes US dollars.']);
}

async function loadForex() {
  const [res, index] = await Promise.all([hub('forex', { short: false }), quotesFor(['DXUSD'])]);
  const quotes = catalogQuotes('forex', good([...rows(res), ...rows(index)]));
  return assemble('forex', { quotes: res, dollarIndex: index }, { quotes, lists: {
    ...Object.fromEntries(['majors', 'crosses'].map((id) => [id, quotes.filter((q) => q.available && q.category === id)])),
    currencyIndices: quotes.filter((q) => q.available && q.category === 'index'),
  }, listStatus: { majors: plainStatus(res), crosses: plainStatus(res), currencyIndices: plainStatus(index) } }, ['Rates are quoted in the second currency of each pair. The dollar index is the FMP US Dollar futures contract; broader currency index coverage is unavailable.']);
}

const MATURITIES = [['month1', '1M', 1], ['month3', '3M', 3], ['month6', '6M', 6], ['year1', '1Y', 12], ['year2', '2Y', 24], ['year3', '3Y', 36], ['year5', '5Y', 60], ['year7', '7Y', 84], ['year10', '10Y', 120], ['year20', '20Y', 240], ['year30', '30Y', 360]];
export function treasuryCurve(data) {
  const latest = [...data].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!latest) return [];
  return MATURITIES.map(([key, label, months]) => ({ label, months, value: finite(latest[key]), date: latest.date })).filter((r) => r.value != null);
}
async function loadBonds(country) {
  if (!country.treasury) return assemble('bonds', {}, { quotes: [], curve: [],
    unavailable: `FMP supplies a par yield curve for US Treasuries only. Government bond yields for ${country.name} are not available from this feed.`,
  }, ['Government bond coverage is the US Treasury curve. Switch the country to United States to read it.']);
  const [rates, res] = await Promise.all([market('treasuryRates', { from: iso(-35), to: iso() }), quotesFor(CATALOGS.bonds.map((r) => r.symbol))]);
  const curve = treasuryCurve(rows(rates));
  return assemble('bonds', { treasury: rates, quotes: res }, { quotes: catalogQuotes('bonds', res), curve, curveDate: curve[0]?.date, curveStatus: plainStatus(rates) }, ['US Treasury par yields. Quoted instruments are Treasury ETFs; ETF prices are not bond yields.']);
}
/* ---------- corporate bonds ------------------------------------------------

   A corporate bond market reaches this page as bond ETFs: FMP quotes no
   individual corporate issue through these feeds. The United States has the
   shipped catalog above; every other country is read off the same fund listing
   its ETF section uses, so following the picker costs no extra request.

   Which funds are corporate is a rule about names, like the ETF collections:
   the vendor returns no asset class for a fund. It has to hold in both halves
   — a fund must name a debt holding *and* name that debt as corporate — or a
   government bond fund with `credit` somewhere in its title walks straight in,
   which is why sovereign wording is a veto rather than an absence. */
const CORPORATE_TABS = ['investmentGrade', 'highYield'];
const fundName = (r) => `${r.companyName || r.name || ''} ${r.symbol || ''}`;
const DEBT_FUND = /(?:^|[^a-z0-9])(?:bonds?|ibonds?|credit|debt|fixed income|obligations?|notes?|gilts?)(?![a-z0-9])/i;
/* Corporate is a claim about the *issuer*, so a credit rating is not evidence
   of one. `Govies 0-6 Months EUROMTS Investment Grade` is a government fund,
   and reading `investment grade` as corporate filed it as one. */
const CORPORATE_FUND = /(?:^|[^a-z0-9])(?:corporate|corporates?|corps?|credit|high[- ]?yield|fallen angels?)(?![a-z0-9])/i;
const SOVEREIGN_FUND = /(?:^|[^a-z0-9])(?:government|govt|govies|treasur[a-z]*|gilts?|sovereign|municipals?|muni|bunds?|btps?|oats?|agency|agencies|mbs|mortgage|inflation|tips)(?![a-z0-9])/i;
const HIGH_YIELD_FUND = /(?:^|[^a-z0-9])(?:high[- ]?yield|junk|speculative|fallen angels?)(?![a-z0-9])/i;
/* `Asset Management - Bonds` is FMP's own classification of a fund, and the
   only field in this test that is not a guess about a name — so it decides
   *whether* a fund is debt, and the name is left to decide whose debt. The
   name test stays beside it because the vendor leaves the industry off some
   listings, and the vendor also mislabels: a European equity fund carrying
   this industry is filtered out by the corporate test below rather than by
   trusting the tag on its own. */
const bondIndustry = (r) => /bonds?$/i.test(String(r.industry || '').trim());
/** Which half of the corporate market a fund claims, or nothing. */
function corporateCategory(row) {
  const name = fundName(row);
  if (!(bondIndustry(row) || DEBT_FUND.test(name))) return null;
  if (!CORPORATE_FUND.test(name) || SOVEREIGN_FUND.test(name)) return null;
  return HIGH_YIELD_FUND.test(name) ? 'highYield' : 'investmentGrade';
}
/** Ranked on a metric, or in the order given when the feed returned none. */
const topBy = (list, metric, limit) => {
  const ranked = sorted(list, metric);
  return (ranked.length ? ranked : list).slice(0, limit);
};

/** The shipped US bond ETFs — the section's own market, and the stated
 *  fallback for a country whose exchange lists none of its own. */
async function usCorporate(extra = {}, notes = []) {
  const res = await quotesFor(CATALOGS.corporate.map((r) => r.symbol));
  const quotes = catalogQuotes('corporate', res);
  return assemble('corporate', { quotes: res }, { quotes, ...extra,
    lists: Object.fromEntries(CORPORATE_TABS.map((id) => [id, quotes.filter((q) => q.available && q.category === id)])),
  }, ['Corporate bond markets are represented by US-listed bond ETFs. FMP does not supply individual corporate bond quotations through these feeds.', ...notes]);
}

async function loadCorporate(country) {
  if (country.code === 'US') return usCorporate({ description: 'US-listed corporate bond ETFs. Individual corporate bond quotes, coupons and maturities are not supplied by FMP.' });
  const screen = await etfUniverse(country);
  const listings = rows(screen).map((r) => normalizeHubQuote(r, { kind: 'etf' }));
  const picks = CORPORATE_TABS.map((id) => [id, topBy(listings.filter((r) => corporateCategory(r) === id), 'marketCap', 6)]);
  const symbols = [...new Set(picks.flatMap(([, list]) => list.map((r) => r.symbol)))];
  if (!symbols.length) return usCorporate({
    scopeLabel: 'United States',
    description: `No fund FMP lists in ${country.name} states a corporate bond holding in its name, so this section stays with the US-listed bond ETFs.`,
  }, [`FMP's fund listing for ${country.name} returned no corporate bond ETF. The US set is shown in its place and labelled as such.`]);
  const res = await quotesFor(symbols);
  const by = new Map(rows(res).map((r) => [r.symbol, r]));
  const lists = Object.fromEntries(picks.map(([id, list]) => [id,
    list.map((r) => normalizeHubQuote({ ...r, ...(by.get(r.symbol) || {}) }, { kind: 'etf', category: id }))]));
  return assemble('corporate', { screen, quotes: res }, {
    quotes: CORPORATE_TABS.flatMap((id) => lists[id]), lists,
    listStatus: Object.fromEntries(CORPORATE_TABS.map((id) => [id, lists[id].length ? plainStatus(res)
      : { status: 'unavailable', message: `No fund FMP lists in ${country.name} names a ${id === 'highYield' ? 'high-yield' : 'investment-grade'} corporate holding.` }])),
    description: `Corporate bond ETFs listed in ${country.name}, largest first. FMP does not quote individual corporate bonds, coupons or maturities through these feeds.`,
  }, [`Read from what a fund's own name says it holds, over the ${listings.length.toLocaleString()} fund listings FMP returned for ${country.name}. The vendor publishes no asset class for a fund, so a corporate bond fund not named after its holding is missing.`]);
}

/** Cash actually paid during the trailing year, divided by latest price.
 * Uses payment dates where supplied and excludes announced future payments. */
export function trailingDistributionYield(dividends, quotePrice, today = iso()) {
  if (!(finite(quotePrice) > 0)) return null;
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end); start.setUTCFullYear(start.getUTCFullYear() - 1);
  const seen = new Set();
  let total = 0, count = 0;
  for (const r of dividends) {
    const date = String(r.paymentDate || r.date || '').slice(0, 10);
    const amount = finite(r.adjDividend ?? r.dividend);
    const identity = `${r.date || date}|${amount}`;
    if (!date || date <= start.toISOString().slice(0, 10) || date > today || amount == null || amount < 0 || seen.has(identity)) continue;
    seen.add(identity); total += amount; count += 1;
  }
  return count ? total / quotePrice * 100 : null;
}
/* Wide enough for a name rule to find something. A bitcoin or Shariah fund is
   nowhere near the top of a listing by size, so the collections below read a
   thousand listings rather than the dozen the rankings need. One request, and
   the same cached one the country's own fund set reads. */
/* **`country=` on the screener is the fund's domicile, not where it trades.**
   European UCITS funds are registered almost entirely in Luxembourg and
   Ireland and listed in Paris, Frankfurt, Amsterdam and Milan, so screening
   France by country returned French-domiciled Amundi share classes listed in
   *London* and missed the whole Paris board — every corporate bond fund a
   French reader would name. `exchange=` is the question this page is actually
   asking, so it is the one sent: one request per exchange, merged on symbol.

   `exchanges` on the country table doubles as a matcher for quote rows, so it
   carries names the screener does not know (`EURONEXT`, `MCE`, `NYSEARCA`);
   only codes FMP's own `available-exchanges` publishes are sent. The United
   States keeps `country=US`, where domicile and listing coincide and six
   exchange requests would buy nothing. */
const FMP_EXCHANGES = new Set(['AMEX', 'AMS', 'ASX', 'ATH', 'BME', 'BRU', 'BSE', 'BUE', 'CBOE', 'CPH',
  'DFM', 'DOH', 'DUB', 'HEL', 'HKSE', 'ICE', 'IOB', 'IST', 'JKT', 'JNB', 'JPX', 'KLS', 'KOE', 'KSC', 'LIS',
  'LSE', 'MCX', 'MEX', 'MIL', 'NASDAQ', 'NSE', 'NYSE', 'NZE', 'OSL', 'PAR', 'PRA', 'SAO', 'SAU', 'SES', 'SET',
  'SGO', 'SHH', 'SHZ', 'SIX', 'STO', 'TAI', 'TLV', 'TSX', 'TSXV', 'TWO', 'VIE', 'WSE', 'XETRA']);
const screenFunds = (params) => limited(() => fetchScreener({ isEtf: true, isActivelyTrading: true, limit: 1000, ...params }));
const etfUniverse = (country) => cached(`etfs:${country.code}`, async () => {
  const venues = country.code === 'US' ? [] : country.exchanges.filter((code) => FMP_EXCHANGES.has(code));
  if (!venues.length) return screenFunds({ country: country.code });
  const parts = await Promise.all(venues.map((exchange) => screenFunds({ exchange })));
  const merged = new Map();
  for (const part of parts) for (const row of rows(part)) if (row.symbol && !merged.has(row.symbol)) merged.set(row.symbol, row);
  return merged.size ? good([...merged.values()]) : parts.find((p) => p.status !== 'ok') || good([]);
});

/* The collection sections the ETFs page leads with, in the order the page
   shows them. Each is a rule over the listings above — the same rule the ETF
   screener applies to the same feed, so a section and its "see all" agree. */
export const ETF_SECTIONS = [
  { id: 'equity', title: 'Equity ETFs' },
  { id: 'commodities', title: 'Commodity ETFs' },
  { id: 'bitcoin', title: 'Bitcoin ETFs' },
  { id: 'gold', title: 'Gold ETFs' },
  { id: 'shariah', title: 'Shariah ETFs' },
  { id: 'country', title: 'Country ETFs' },
];

/**
 * Six funds per collection, quoted in one batch: two requests for five
 * sections, whatever the country, and only for the page that shows them.
 */
export async function loadEtfCollections(code = DEFAULT_COUNTRY) {
  const country = countryOf(code);
  if (!session()) return { status: 'skipped', message: 'Connect your FMP API key in Settings to load fund collections.', collections: {}, listingCount: 0 };
  const universe = await etfUniverse(country);
  const listings = rows(universe).map((r) => normalizeHubQuote(r, { kind: 'etf' }));
  const picks = ETF_SECTIONS.map((section) => [section.id, fundsIn(listings, section.id, 6)]);
  const symbols = [...new Set(picks.flatMap(([, list]) => list.map((r) => r.symbol)))];
  const quotes = symbols.length ? await quotesFor(symbols) : universe;
  const by = new Map(rows(quotes).map((r) => [r.symbol, r]));
  const status = universe.status === 'ok' ? plainStatus(quotes) : plainStatus(universe);
  return {
    ...status,
    collections: Object.fromEntries(picks.map(([id, list]) => [id,
      list.map((r) => normalizeHubQuote({ ...r, ...(by.get(r.symbol) || {}) }, { kind: 'etf' }))])),
    listingCount: listings.length,
    note: `Read from what a fund's own name says it holds, over the ${listings.length.toLocaleString()} listings FMP returned for ${country.name}. The vendor publishes no asset class for a fund, so a fund not named after its holding is missing from its collection.`,
  };
}

/** The funds a country's ETF section ranks: the shipped US catalog, or the
 *  most traded funds FMP lists in that country. */
async function etfSet(country) {
  if (country.code === 'US') {
    const feed = await quotesFor(CATALOGS.etfs.map((r) => r.symbol));
    return { feed, base: catalogQuotes('etfs', feed) };
  }
  const screen = await etfUniverse(country);
  const candidates = sorted(rows(screen).map((r) => normalizeHubQuote(r, { kind: 'etf' })), 'volume').slice(0, 12);
  if (!candidates.length) return { feed: screen, base: [] };
  const feed = await quotesFor(candidates.map((r) => r.symbol));
  const by = new Map(rows(feed).map((r) => [r.symbol, r]));
  return { feed, base: candidates.map((r) => normalizeHubQuote({ ...r, ...(by.get(r.symbol) || {}) }, { kind: 'etf' })) };
}

async function loadEtfs(country) {
  const { feed: res, base } = await etfSet(country);
  const live = base.filter((r) => r.available);
  if (!live.length) {
    const missing = res.status === 'ok'
      ? { status: 'unavailable', message: `FMP's ETF screener returned no funds listed in ${country.name}.` }
      : plainStatus(res);
    return assemble('etfs', { quotes: res }, { quotes: base, lists: {},
      listStatus: Object.fromEntries(['volume', 'returns', 'dividendYield', 'aum'].map((id) => [id, missing])) },
    [`ETF coverage follows FMP's fund classification for ${country.name}.`]);
  }
  const details = await Promise.all(live.map(async (q) => {
    const [info, changes, dividends] = await Promise.all([
      limited(() => fetchEtfInfo(q.symbol)), hub('priceChanges', { symbol: q.symbol }), feed('dividends', q.symbol),
    ]);
    return { ...q, aum: info.status === 'ok' ? finite(info.data?.assetsUnderManagement) : null,
      return1Y: finite(rows(changes)[0]?.['1Y']), dividendYield: dividends.status === 'ok' ? trailingDistributionYield(rows(dividends), q.price) : null,
      detailStatus: { aum: plainStatus(info), returns: plainStatus(changes), dividendYield: plainStatus(dividends) } };
  }));
  const statusFor = (name) => details.find((q) => q.detailStatus[name]?.status === 'ok')?.detailStatus[name] || details[0]?.detailStatus[name] || plainStatus(res);
  return assemble('etfs', { quotes: res }, { quotes: base, lists: { volume: sorted(details, 'volume'), returns: sorted(details, 'return1Y'), dividendYield: sorted(details, 'dividendYield'), aum: sorted(details, 'aum') },
    listStatus: { volume: plainStatus(res), returns: statusFor('returns'), dividendYield: statusFor('dividendYield'), aum: statusFor('aum') },
  }, [country.code === 'US' ? 'Rankings compare the selected US-listed ETFs shown here.'
    : `Rankings compare the ${live.length} most traded funds FMP lists in ${country.name}.`,
  'One-year performance is price change, excluding reinvested distributions. Distribution yield is cash distributions paid over the trailing year divided by the latest price; it is not SEC yield.']);
}

/**
 * The world's funds, ranked four ways.
 *
 * Listed in the United States, because that is where the world's funds list —
 * a global tracker is bought in New York whatever it holds — and the section
 * says so rather than implying a worldwide listing sweep. It reuses the same
 * cached fund listing the US ETF section reads, so the whole section is one
 * batch of quotes on top of a request already made.
 *
 * "Largest" and "most traded" are size and turnover, not merit: nothing here
 * grades a fund, and a basket cannot be graded by anything in this report.
 */
async function loadWorldEtfs() {
  const universe = await etfUniverse(countryOf(DEFAULT_COUNTRY));
  const listings = rows(universe).map((r) => normalizeHubQuote(r, { kind: 'etf' }));
  if (!listings.length) {
    return assemble('worldEtfs', { screen: universe }, { quotes: [], lists: {} },
      ['Fund rankings read the US-listed fund universe, which is where the world\u2019s funds list.']);
  }

  const picks = [
    ['largest', topBy(listings, 'marketCap', 6)],
    ['traded', topBy(listings, 'volume', 6)],
    ['global', fundsIn(listings, 'global', 6)],
    ['country', fundsIn(listings, 'country', 6)],
  ];
  const symbols = [...new Set(picks.flatMap(([, list]) => list.map((r) => r.symbol)))];
  const quotes = symbols.length ? await quotesFor(symbols) : universe;
  const by = new Map(rows(quotes).map((r) => [r.symbol, r]));
  const fill = (list) => list.map((r) => normalizeHubQuote({ ...r, ...(by.get(r.symbol) || {}) }, { kind: 'etf' }));
  const lists = Object.fromEntries(picks.map(([id, list]) => [id, fill(list)]));

  return assemble('worldEtfs', { screen: universe, quotes }, {
    quotes: lists.largest, lists,
    listStatus: Object.fromEntries(picks.map(([id, list]) => [id, list.length ? plainStatus(quotes)
      : { status: 'unavailable', message: 'No fund in the listing states this mandate in its name.' }])),
  }, [`Ranked over the ${listings.length.toLocaleString()} funds FMP lists in the United States, which is where the world\u2019s funds list. Size is the vendor\u2019s market value for the fund, not a published net-asset total, and neither column is a judgement of the fund.`,
    'The last two are name rules, like every collection here: a fund states its mandate or its country in its own name, and one that does not is missing from its row.']);
}

/* The release history the world maps read.

   FMP caps this calendar at a 90-day range, so 180 days is two requests — the
   cheap path, and the one that normally works. When a window comes back
   refused — a rate limit, or a plan whose `from`/`to` access is limited — it is
   retried in thirty-day slices and whatever the vendor will give is kept: a
   partial map beats a blank one. What could not be loaded is reported, so a
   missing window never reads as a country with nothing to report. */
const HISTORY_WINDOWS = [[-89, 0], [-179, -90]];
async function calendarHistory() {
  const collected = [];
  const failures = [];
  await Promise.all(HISTORY_WINDOWS.map(async ([from, to]) => {
    const whole = await market('econCalendar', { from: iso(from), to: iso(to) });
    if (whole.status === 'ok') { collected.push(...rows(whole)); return; }
    const slices = [];
    for (let start = from; start < to; start += 30) slices.push([start, Math.min(start + 29, to)]);
    const parts = await Promise.all(slices.map(([a, b]) => market('econCalendar', { from: iso(a), to: iso(b) })));
    for (const part of parts) {
      if (part.status === 'ok') collected.push(...rows(part)); else failures.push(part);
    }
  }));
  return { rows: collected, failures };
}

/* ---------- the United States indicator board -----------------------------

   `economic-indicators` is a US dataset: one series per request, capped at a
   90-day window like every dated feed here. A series with any history
   therefore costs one request per window, which is why the board loads the six
   that lead the section and buys the other seventeen only when a reader asks
   for them.

   `unit` is this table's own, not the vendor's — the feed returns a bare
   number. Each one was read off a live observation rather than assumed:
   real GDP 24,269.613 (USD bn), retail sales 660,047 (USD mn), payrolls
   159,075 (thousands), housing starts 1,239 (thousands of units), vehicle
   sales 17.19 (millions), durable goods 339,392 (USD mn), trade balance
   −88,576 (USD mn), claims 206,000 (people), sentiment 55.2 (index).

   `inflation` is offered by the endpoint and left out: it returned nothing for
   any recent window, and `inflationRate` is the series a reader means. */
export const US_INDICATORS = [
  { name: 'realGDP', step: 'quarter', label: 'Real GDP', group: 'Output', unit: 'usdBn', note: 'Chained 2017 dollars, annualised', windows: 3, headline: true },
  { name: 'GDP', step: 'quarter', label: 'GDP', group: 'Output', unit: 'usdBn', note: 'Current dollars, annualised', windows: 3 },
  { name: 'realGDPPerCapita', step: 'quarter', label: 'Real GDP per capita', group: 'Output', unit: 'usd', note: 'Chained 2017 dollars', windows: 3 },
  { name: 'nominalPotentialGDP', step: 'quarter', label: 'Potential GDP', group: 'Output', unit: 'usdBn', note: 'Congressional Budget Office estimate', windows: 3 },
  { step: 'month', name: 'industrialProductionTotalIndex', label: 'Industrial production', group: 'Output', unit: 'index', note: '2017 = 100', windows: 2 },
  { step: 'month', name: 'inflationRate', label: 'Inflation rate', group: 'Prices', unit: 'percent', note: 'Consumer prices, year over year', windows: 2, headline: true },
  { step: 'month', name: 'CPI', label: 'Consumer price index', group: 'Prices', unit: 'index', note: '1982–84 = 100', windows: 2 },
  { step: 'month', name: 'unemploymentRate', label: 'Unemployment rate', group: 'Labour', unit: 'percent', note: 'Share of the labour force', windows: 2, headline: true },
  { step: 'month', name: 'totalNonfarmPayroll', label: 'Nonfarm payrolls', group: 'Labour', unit: 'jobs', note: 'Employees on payrolls', windows: 2, headline: true },
  { name: 'initialClaims', step: 'week', label: 'Initial jobless claims', group: 'Labour', unit: 'people', note: 'New claims, weekly', windows: 1, headline: true },
  { step: 'month', name: 'federalFunds', label: 'Federal funds rate', group: 'Rates and credit', unit: 'percent', note: 'Effective rate', windows: 1, headline: true },
  { name: '30YearFixedRateMortgageAverage', step: 'week', label: '30-year mortgage', group: 'Rates and credit', unit: 'percent', note: 'Fixed-rate average', windows: 1 },
  { name: '15YearFixedRateMortgageAverage', step: 'week', label: '15-year mortgage', group: 'Rates and credit', unit: 'percent', note: 'Fixed-rate average', windows: 1 },
  { step: 'month', name: '3MonthOr90DayRatesAndYieldsCertificatesOfDeposit', label: '3-month CD rate', group: 'Rates and credit', unit: 'percent', note: 'Certificates of deposit', windows: 1 },
  { name: 'commercialBankInterestRateOnCreditCardPlansAllAccounts', step: 'quarter', label: 'Credit card rate', group: 'Rates and credit', unit: 'percent', note: 'Commercial banks, all accounts', windows: 3 },
  { step: 'month', name: 'retailSales', label: 'Retail sales', group: 'Demand', unit: 'usdMn', note: 'Monthly, all retailers', windows: 2 },
  { step: 'month', name: 'durableGoods', label: 'Durable goods orders', group: 'Demand', unit: 'usdMn', note: 'New orders, monthly', windows: 2 },
  { step: 'month', name: 'totalVehicleSales', label: 'Vehicle sales', group: 'Demand', unit: 'millionUnits', note: 'Annualised rate', windows: 2 },
  { step: 'month', name: 'consumerSentiment', label: 'Consumer sentiment', group: 'Demand', unit: 'index', note: 'University of Michigan', windows: 2 },
  { step: 'month', name: 'newPrivatelyOwnedHousingUnitsStartedTotalUnits', label: 'Housing starts', group: 'Housing', unit: 'thousandUnits', note: 'Annualised rate', windows: 2 },
  { step: 'month', name: 'tradeBalanceGoodsAndServices', label: 'Trade balance', group: 'Trade and money', unit: 'usdMn', note: 'Goods and services, monthly', windows: 2 },
  { step: 'month', name: 'retailMoneyFunds', label: 'Retail money funds', group: 'Trade and money', unit: 'usdBn', note: 'Assets outstanding', windows: 2 },
  { step: 'month', name: 'smoothedUSRecessionProbabilities', label: 'Recession probability', group: 'Trade and money', unit: 'percent', note: 'Smoothed monthly estimate', windows: 2 },
];
export const US_INDICATOR_GROUPS = [...new Set(US_INDICATORS.map((item) => item.group))];
const HEADLINE = US_INDICATORS.filter((item) => item.headline).map((item) => item.name);
/** Ninety days at a time, walking back: the vendor clips any wider range. */
const INDICATOR_WINDOWS = [[-95, 0], [-185, -91], [-275, -186]];
/** One FMP request buys ninety days of one series. Nothing else here spends. */
export const INDICATOR_WINDOW_DAYS = 90;

/* The board's three windows are the first three rungs of a ladder the chart
   climbs further when a reader asks for years of one series. Both walk the same
   rungs and both key the cache on `from` alone, so a window one of them has
   already paid for is free to the other. */
function indicatorWindows(count) {
  const out = INDICATOR_WINDOWS.slice(0, count);
  for (let index = out.length; index < count; index += 1) out.push([-95 - 90 * index, -(90 * index + 1)]);
  return out;
}

/** How far back `count` windows reach, in days — what a range can honestly claim. */
export const indicatorSpan = (count) => 95 + 90 * Math.max(0, count - 1);

/** One series over `count` windows, as dated observations oldest first. */
async function indicatorPoints(name, count, onWindow) {
  const windows = indicatorWindows(count);
  const results = await Promise.all(windows.map(([from, to]) =>
    cached(`indicator:${name}:${from}`, () => hub('indicators', { name, from: iso(from), to: iso(to) }))
      .then((result) => { onWindow?.(); return result; })));
  const byDate = new Map();
  for (const result of results) {
    for (const row of rows(result)) {
      const value = finite(row.value);
      if (row.date && value !== null) byDate.set(String(row.date).slice(0, 10), value);
    }
  }
  const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  const refused = results.find((result) => result.status !== 'ok');
  return { points, windows: count, refused,
    message: refused?.message || `FMP returned no observation for this series in the past ${count * 90} days.` };
}

/** Load these series, newest observation first in `latest`. One request per
 *  window per series; every window is cached, so the board never pays twice. */
export async function loadUsIndicators(names = HEADLINE, onProgress) {
  const out = new Map();
  let done = 0;
  await Promise.all(names.map(async (name) => {
    const spec = US_INDICATORS.find((item) => item.name === name) || { windows: 1 };
    const { points, refused, message } = await indicatorPoints(name, spec.windows || 1);
    out.set(name, points.length ? { ...spec, status: 'ok', points, latest: points.at(-1), previous: points.at(-2) || null }
      : { ...spec, status: refused ? refused.status : 'unavailable', points: [], latest: null, previous: null, message });
    onProgress?.(++done, names.length);
  }));
  return out;
}

/**
 * One series over a longer run, for the Economy chart.
 *
 * `windows` is the arithmetic the reader consented to by picking a range: one
 * request per ninety days, so ten years of a series is forty-one of them.
 * `onProgress(done, total)` reports windows as they land.
 */
export async function loadIndicatorRange(name, windows, onProgress) {
  const count = Math.max(1, Math.round(windows));
  let done = 0;
  const { points, refused, message } = await indicatorPoints(name, count, () => onProgress?.(++done, count));
  return points.length ? { status: 'ok', points, windows: count }
    : { status: refused ? refused.status : 'unavailable', points: [], windows: count, message };
}

async function loadEconomy(country, { usSeries = true } = {}) {
  /* The indicator series are a US dataset at FMP whichever country is picked,
     and the board says so; the release calendar carries a country on every
     row, so that part of the section does travel — and `countryReleases()`
     turns the country's own rows into the board that replaces the US one.

     `usSeries` is why that is worth having: the series cost about ten requests
     and a reader looking at France is shown none of them, so the hub asks for
     them only where they are displayed. The World Economy page and the US
     still ask, and their answers are cached under their own key. */
  const [calendar, history, usIndicators] = await Promise.all([
    market('econCalendar', { from: iso(-1), to: iso(14) }),
    calendarHistory(),
    usSeries ? loadUsIndicators() : new Map(),
  ]);
  const codes = country.calendar.map((value) => value.toUpperCase());
  const worldRates = economyRates(history.rows);
  const mapped = Math.max(...Object.values(worldRates).map((entry) => Object.keys(entry).length), 0);
  return assemble('economy', { calendar }, {
    usIndicators, usIndicatorNames: US_INDICATORS.map((item) => item.name),
    countryReleases: countryReleases(history.rows, codes),
    worldRates,
    mapStatus: !history.failures.length ? { status: 'ok' }
      : mapped ? { status: 'partial', message: `Part of the past 180 days could not be loaded — ${history.failures[0].message || 'FMP refused the window'}. A country whose only release fell in it is blank.` }
        : { status: history.failures[0].status === 'gated' ? 'gated' : 'error',
          message: history.failures[0].message || 'FMP returned no release history for the past 180 days.' },
    worldCalendar: rows(calendar).sort((a, b) => String(a.date).localeCompare(String(b.date))),
    calendar: rows(calendar).filter((r) => codes.includes(String(r.country || '').trim().toUpperCase())).sort((a, b) => String(a.date).localeCompare(String(b.date))), calendarStatus: plainStatus(calendar),
  }, ['World maps use the latest reported actual GDP growth and headline inflation releases in the past 180 days. Year-over-year, quarterly and annualized quarterly GDP rates are kept separate. Blank countries have no matching actual in the loaded history.',
    `The country calendar follows ${country.name}; the World Economy page shows all countries. Reporting periods differ and releases may be revised.`,
    'The indicator board is the United States alone: FMP publishes these series for no other country. Each figure is the latest observation in its series, in the unit the series is reported in, and the scale beside it is this app’s label rather than the vendor’s.',
    `Under another country that board is replaced by ${country.name}’s own releases, read from the same 180-day calendar: the latest reported figure per series, ordered by the vendor’s impact rating and printed in the unit the release stated.`]);
}

const LOADERS = { indices: loadIndices, stocks: loadStocks, world: loadWorld, crypto: loadCrypto, futures: loadFutures, forex: loadForex, bonds: loadBonds, corporate: loadCorporate, etfs: loadEtfs, worldEtfs: loadWorldEtfs, economy: loadEconomy };
