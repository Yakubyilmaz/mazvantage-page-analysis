/* Synthetic UI fixtures, exclusively for tools/market-hub-preview.html and tests.
   These values are invented and must never be imported by production code. */
export const FIXTURE_KEY = 'ui-test-fixture-not-a-real-key';
export const STOCKS = ['NVDA', 'TSLA', 'AAPL', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AVGO', 'PLTR', 'JPM', 'WMT', 'XOM'];
export const WORLD = ['TSM', 'ASML', 'NVO', 'TM', 'SAP', 'BABA', 'SONY', 'NVS', 'SHEL', 'AZN', 'HSBC', 'INFY', 'RIO', 'BHP', 'HDB', 'SAN', 'SHOP', 'SE', 'MELI', '005930.KS', 'MC.PA', 'NESN.SW'];
export const ETFS = ['SPY', 'QQQ', 'IWM', 'VOO', 'VTI', 'GLD', 'TLT', 'HYG', 'XLK', 'XLE', 'SCHD', 'JEPI', 'LQD', 'VCIT', 'VCSH', 'USIG', 'JNK', 'SHYG', 'SJNK', 'IEF', 'SHY', 'SGOV', 'TIP', 'GOVT',
  // Funds whose names are what the ETF screener's collections select on: a
  // multiple, an inverse, a coin, a commodity, a property basket.
  'TQQQ', 'SQQQ', 'IBIT', 'ETHA', 'DBC', 'VNQ',
  // The two Shariah funds the collection section looks for by name.
  'SPUS', 'HLAL'];
const INDICES = ['^GSPC', '^NDX', '^DJI', '^VIX', '^RUT', '^IXIC', '^NYA', '^OEX', '^FTSE', '^GDAXI', '^N225', '^HSI',
  '^FCHI', '^GSPTSE', '^AXJO', '^BVSP', '^STOXX50E', 'FTSEMIB.MI', '000001.SS', '^TASI', '^JN0U.JO', '^NZ50', '^UNPLACED'];
const CRYPTO = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD', 'LINKUSD'];
const FOREX = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURCHF', 'DXUSD'];
const FUTURES = ['ESUSD', 'NQUSD', 'YMUSD', 'RTYUSD', 'GCUSD', 'SIUSD', 'CLUSD', 'BZUSD', 'NGUSD', 'RBUSD', 'HOUSD',
  'HGUSD', 'PLUSD', 'PAUSD', 'ALIUSD', 'ZCUSX', 'KEUSX', 'ZSUSX', 'KCUSX', 'CCUSD', 'CTUSX', 'SBUSX',
  // Rate and currency contracts, so every collection on the futures board has
  // rows, plus one the grouping table has never heard of.
  'ZQUSD', 'ZTUSD', 'ZFUSD', 'ZNUSD', 'ZBUSD', 'DXUSD', 'MGCUSD', 'LBUSD', 'XXUSD'];
const FUTURES_NAMES = { ZQUSD: '30 Day Fed Fund Futures', ZTUSD: '2-Year T-Note Futures', ZFUSD: 'Five-Year US Treasury Note',
  ZNUSD: '10-Year T-Note Futures', ZBUSD: '30 Year U.S. Treasury Bond Futures', DXUSD: 'US Dollar', MGCUSD: 'Micro Gold Futures',
  LBUSD: 'Lumber Futures', XXUSD: 'Unplaced Futures Contract' };
/* Foreign listings, so the country picker has something shaped like a local
   market to read. Suffix -> [exchange, country], matching FMP's own spelling. */
const MARKETS = { DE: ['XETRA', 'DE'], L: ['LSE', 'GB'], TO: ['TSX', 'CA'], PA: ['EURONEXT', 'FR'],
  SW: ['SIX', 'CH'], KS: ['KSC', 'KR'], T: ['JPX', 'JP'], MI: ['MIL', 'IT'] };
export const COUNTRY_STOCKS = { FR: ['MC.PA', 'OR.PA', 'TTE.PA'], DE: ['SAP.DE', 'SIE.DE', 'ALV.DE', 'BMW.DE', 'BAS.DE', 'DTE.DE'],
  GB: ['HSBA.L', 'SHEL.L', 'AZN.L', 'ULVR.L'] };
const COUNTRY_ETFS = { DE: ['EXS1.DE', 'EXX5.DE'] };
const NAMES = { NVDA: 'NVIDIA Corporation', TSLA: 'Tesla, Inc.', AAPL: 'Apple Inc.', AMD: 'Advanced Micro Devices', MSFT: 'Microsoft Corporation', AMZN: 'Amazon.com, Inc.', META: 'Meta Platforms', GOOGL: 'Alphabet Inc.', GOOG: 'Alphabet Inc.', AVGO: 'Broadcom Inc.', PLTR: 'Palantir Technologies', JPM: 'JPMorgan Chase & Co.', WMT: 'Walmart Inc.', XOM: 'Exxon Mobil Corporation', TSM: 'Taiwan Semiconductor Manufacturing', ASML: 'ASML Holding', NVO: 'Novo Nordisk', TM: 'Toyota Motor', SAP: 'SAP SE', BABA: 'Alibaba Group', BTCUSD: 'Bitcoin', ETHUSD: 'Ethereum', SOLUSD: 'Solana', BNBUSD: 'BNB', XRPUSD: 'XRP', DOGEUSD: 'Dogecoin', ADAUSD: 'Cardano', LINKUSD: 'Chainlink' };
/* Headlines for the index news section: some name an index, some deliberately
   do not, so the filter has something to reject. Invented, like every other
   value in this file. */
const HEADLINES = [
  ['Sensex, Nifty end higher as banks rally into the close', 'Mint', 2],
  ['S&P 500 and Nasdaq 100 finish at records after a soft inflation print', 'Seeking Alpha', 5],
  ['Apple supplier cuts guidance on weaker handset demand', 'Reuters', 6],
  ['Dow Jones slips as industrials weigh on the session', 'Dow Jones Newswires', 8],
  ['FTSE 100 steadies after the Bank of England holds', 'Market Index', 11],
  ['Crude oil holds above $80 a barrel', 'Binance News', 12],
  ['DAX and CAC 40 open higher across Europe', 'Japan Corporate News', 13],
  ['Nikkei falls as the yen strengthens against the dollar', 'Mint', 15],
  ['Weekend Wrap: back to square one', 'Market Index', 17],
  ['Hang Seng leads Asia lower on property concerns', 'Seeking Alpha', 19],
  ['Russell 2000 outpaces large caps for a third session', 'CNBC TV18', 20],
  ['VIX drops below 16 as hedging demand fades', 'Seeking Alpha', 26],
  ['A private credit fund returns capital to investors', 'Binance News', 30],
  ['Euro Stoxx 50 and IBEX 35 close the week in the green', 'Market Index', 34],
  ['Gold steadies above $4,300 as the dollar softens', 'Reuters', 4],
  ['Goldman Sachs names a new head of commodities trading', 'Dow Jones Newswires', 7],
  ['Copper and aluminium rally on Chinese restocking', 'Mint', 10],
  ['Natural gas slides as mild weather cuts heating demand', 'Market Index', 14],
  ['WTI crude and Brent diverge after the inventory report', 'Seeking Alpha', 18],
  ['Wheat and corn ease as the harvest accelerates', 'Binance News', 22],
];
/* Countries for the economy world maps. The vendor spells the United Kingdom
   `UK` on this feed, which is exactly the alias the parser has to handle. */
const MAP_COUNTRIES = ['US', 'UK', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'CH', 'PL', 'TR', 'RU', 'CA', 'MX', 'BR', 'AR',
  'CL', 'ZA', 'EG', 'NG', 'SA', 'AE', 'IL', 'IN', 'CN', 'JP', 'KR', 'TW', 'ID', 'TH', 'MY', 'SG', 'PH', 'VN', 'AU',
  'NZ', 'NO', 'DK', 'FI', 'IE', 'PT', 'GR', 'CZ', 'HU', 'RO'];
/* One entry per `economic-indicators` series the US board asks for, at the
   magnitude and frequency a live observation showed. */
const INDICATOR_SERIES = {
  realGDP: { value: 24269.613, step: 'quarter' }, GDP: { value: 31422.526, step: 'quarter' },
  realGDPPerCapita: { value: 68123, step: 'quarter' }, nominalPotentialGDP: { value: 30500, step: 'quarter' },
  industrialProductionTotalIndex: { value: 103.4, step: 'month' }, inflationRate: { value: 3.4, step: 'month' },
  CPI: { value: 334.98, step: 'month' }, unemploymentRate: { value: 4.1, step: 'month' },
  totalNonfarmPayroll: { value: 159075, step: 'month' }, initialClaims: { value: 206000, step: 'week' },
  federalFunds: { value: 4.33, step: 'month' }, '30YearFixedRateMortgageAverage': { value: 6.35, step: 'week' },
  '15YearFixedRateMortgageAverage': { value: 5.6, step: 'week' },
  '3MonthOr90DayRatesAndYieldsCertificatesOfDeposit': { value: 4.2, step: 'month' },
  commercialBankInterestRateOnCreditCardPlansAllAccounts: { value: 21.4, step: 'quarter' },
  retailSales: { value: 660047, step: 'month' }, durableGoods: { value: 339392, step: 'month' },
  totalVehicleSales: { value: 17.19, step: 'month' }, consumerSentiment: { value: 55.2, step: 'month' },
  newPrivatelyOwnedHousingUnitsStartedTotalUnits: { value: 1239, step: 'month' },
  tradeBalanceGoodsAndServices: { value: -88576, step: 'month' }, retailMoneyFunds: { value: 2310, step: 'month' },
  smoothedUSRecessionProbabilities: { value: .76, step: 'month' },
};
/* Fund names as a provider spells them. The ETF screener's collections read
   the name, so a fixture called "GLD UI fixture" would exercise nothing. */
const FUND_NAMES = {
  SPY: 'SPDR S&P 500 ETF Trust', QQQ: 'Invesco QQQ Trust', IWM: 'iShares Russell 2000 ETF',
  VOO: 'Vanguard S&P 500 ETF', VTI: 'Vanguard Total Stock Market ETF', GLD: 'SPDR Gold Shares',
  TLT: 'iShares 20+ Year Treasury Bond ETF', HYG: 'iShares iBoxx High Yield Corporate Bond ETF',
  XLK: 'Technology Select Sector SPDR Fund', XLE: 'Energy Select Sector SPDR Fund',
  SCHD: 'Schwab US Dividend Equity ETF', JEPI: 'JPMorgan Equity Premium Income ETF',
  LQD: 'iShares iBoxx Investment Grade Corporate Bond ETF', VCIT: 'Vanguard Intermediate-Term Corporate Bond ETF',
  VCSH: 'Vanguard Short-Term Corporate Bond ETF', USIG: 'iShares Broad USD Investment Grade Corporate Bond ETF',
  JNK: 'SPDR Bloomberg High Yield Bond ETF', SHYG: 'iShares 0-5 Year High Yield Corporate Bond ETF',
  SJNK: 'SPDR Bloomberg Short Term High Yield Bond ETF', IEF: 'iShares 7-10 Year Treasury Bond ETF',
  SHY: 'iShares 1-3 Year Treasury Bond ETF', SGOV: 'iShares 0-3 Month Treasury Bond ETF',
  TIP: 'iShares TIPS Bond ETF', GOVT: 'iShares US Treasury Bond ETF',
  TQQQ: 'ProShares UltraPro QQQ 3x Shares', SQQQ: 'ProShares UltraPro Short QQQ',
  IBIT: 'iShares Bitcoin Trust ETF', ETHA: 'iShares Ethereum Trust ETF',
  DBC: 'Invesco DB Commodity Index Tracking Fund', VNQ: 'Vanguard Real Estate ETF',
  SPUS: 'SP Funds S&P 500 Sharia Industry Exclusions ETF', HLAL: 'Wahed FTSE USA Shariah ETF',
  'EXS1.DE': 'iShares Core DAX UCITS ETF', 'EXX5.DE': 'iShares Dow Jones Global Titans 50 UCITS ETF',
};
/* A thumbnail that cannot be mistaken for a photograph, as a data URI: the
   harness CSP allows `data:` and blocks every remote image. */
const thumbnail = (label, hue) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="hsl(${hue} 42% 88%)"/><rect x="0" y="86" width="160" height="14" fill="hsl(${hue} 42% 74%)"/><text x="80" y="54" font-family="system-ui" font-size="13" fill="hsl(${hue} 38% 34%)" text-anchor="middle">${label}</text></svg>`)}`;
const seed = symbol => [...symbol].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
const date = offset => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
export function fixtureQuote(symbol) {
  const code = seed(symbol), price = +(35 + code / 7).toFixed(2);
  const [exchange, country] = MARKETS[symbol.includes('.') ? symbol.split('.').pop().toUpperCase() : ''] || ['NASDAQ', 'US'];
  const name = NAMES[symbol] || FUND_NAMES[symbol] || `${symbol} UI fixture`;
  return { symbol, name, companyName: name, price,
    change: 1.25, changePercentage: +(code % 17 / 2 - 3).toFixed(2), changesPercentage: +(code % 17 / 2 - 3).toFixed(2),
    marketCap: 1000000000 * (700 - code % 400), volume: 1000000 * (code % 120 + 1), avgVolume: 1000000 * (code % 100 + 1),
    dayHigh: price * 1.03, dayLow: price * .97, yearHigh: price * 1.35, yearLow: price * .75,
    exchange, exchangeShortName: exchange, country,
    // Two fields the screener feed carries and the ETF collections select on:
    // a distribution (zero for about one listing in seven) and a beta that
    // goes negative, so the inverse and negative-beta collections have rows.
    lastAnnualDividend: +((code % 7) * 0.38).toFixed(2), beta: +((code % 250) / 100 - 0.4).toFixed(2),
    currency: 'USD', isEtf: ETFS.includes(symbol) || Object.values(COUNTRY_ETFS).flat().includes(symbol), isFund: false, isActivelyTrading: true,
    cik: symbol === 'GOOG' || symbol === 'GOOGL' ? '0001652044' : `000${code}`, fullTimeEmployees: String(20000 + code * 50),
    timestamp: Math.floor(Date.now() / 1000), sector: 'Technology' };
}
function history(url, intraday = false) {
  const symbol = url.searchParams.get('symbol') || 'NVDA';
  const count = intraday ? 78 : 260;
  const base = fixtureQuote(symbol).price;
  const code = seed(symbol);
  const end = new Date(`${url.searchParams.get('to') || date(0)}T12:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end.getTime() - (intraday ? 0 : count - index - 1) * 864e5).toISOString().slice(0, 10);
    // A per-symbol phase, so two fixture series never trace the same shape.
    const phase = code % 17 / 3;
    const drift = .6 + (code % 11) / 25;
    const close = +(base * (.75 + index / count * .25 * drift) + Math.sin(index * .27 + phase) * base * .014
      + Math.cos(index * .11 + phase) * base * .023 * drift).toFixed(2);
    const minute = 9 * 60 + 30 + index * 5;
    return { symbol, date: intraday ? `${day} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00` : day,
      open: close - .7, high: close + 1.5, low: close - 1.3, close, price: close, volume: 1000000 + index * 10000 };
  }).reverse();
}

export function fixturePayload(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const path = url.pathname.replace(/^\/stable\//, '');
  const symbols = (url.searchParams.get('symbols') || url.searchParams.get('symbol') || 'NVDA').split(',');
  if (path === 'batch-quote' || path === 'quote') return symbols.map(fixtureQuote);
  if (path === 'batch-index-quotes') return INDICES.map(fixtureQuote);
  if (path === 'batch-crypto-quotes') return CRYPTO.map(fixtureQuote);
  if (path === 'batch-forex-quotes') return FOREX.map(fixtureQuote);
  if (path === 'batch-commodity-quotes') return FUTURES.map(fixtureQuote);
  if (path === 'commodities-list') return FUTURES.map((symbol, index) => ({
    symbol, name: FUTURES_NAMES[symbol] || `${symbol} UI fixture`, exchange: null,
    tradeMonth: ['Oct', 'Nov', 'Dec', 'Mar', 'Sep'][index % 5], currency: symbol.endsWith('USX') ? 'USX' : 'USD',
  }));
  if (path === 'company-screener') {
    const country = url.searchParams.get('country');
    const abroad = country && country !== 'US';
    if (url.searchParams.get('isEtf') === 'true') return (abroad ? COUNTRY_ETFS[country] || [] : ETFS).map(fixtureQuote);
    if (abroad) return (COUNTRY_STOCKS[country] || []).map(fixtureQuote);
    return [...STOCKS, 'GOOG', 'NVDA.DE'].map(fixtureQuote);
  }
  if (['most-active', 'biggest-gainers', 'biggest-losers'].includes(path)) {
    const values = [...STOCKS, 'GOOG', 'NVDA.DE'].map(fixtureQuote);
    if (path === 'biggest-gainers') values.forEach((row, index) => { row.changePercentage = row.changesPercentage = 15 - index * .5; });
    if (path === 'biggest-losers') values.forEach((row, index) => { row.changePercentage = row.changesPercentage = -15 + index * .5; });
    return values;
  }
  if (path.includes('historical-price') || path.includes('historical-chart')) return history(url, path.includes('5min'));
  if (path === 'profile') return symbols.map(fixtureQuote);
  if (path === 'news/stock') return symbols.slice(0,9).map((symbol,index)=>({symbol,title:`${symbol} company news for market preview`,url:`https://example.com/stocks/${symbol}`,site:'Fixture News',publishedDate:date(-index)}));
  if (path === 'earnings-calendar') return [...STOCKS.slice(0, 10), 'NVDA.DE'].map((symbol, index) => ({
    symbol, name: NAMES[symbol] || symbol, date: date(index + 1), epsEstimated: index === 0 ? 0 : .8 + index * .12,
    epsActual: null, revenueEstimated: 1000000000 + index * 900000000, revenueActual: null, time: index % 2 ? 'amc' : 'bmo',
  }));
  if (path === 'dividends-calendar') return [...STOCKS.slice(0, 8), 'ADBE.SW'].map((symbol, index) => ({
    symbol, date: date(index), label: date(index), adjDividend: 0.24 + index * 0.05, dividend: 0.24 + index * 0.05,
    recordDate: date(index + 1), paymentDate: date(index + 14), declarationDate: date(-20),
    yield: +(0.4 + index * 0.2).toFixed(2), frequency: 'Quarterly',
  }));
  if (path === 'ipos-calendar') return STOCKS.slice(0, 6).map((symbol, index) => ({ symbol, company: `${NAMES[symbol]} · IPO fixture`,
    date: date(index + 3), exchange: 'NASDAQ', priceRange: `${12 + index}-${15 + index}`, shares: 10000000 + index * 1000000,
  }));
  if (path === 'sector-performance-snapshot') return ['Technology', 'Energy', 'Financial Services', 'Healthcare', 'Utilities']
    .map((sector, index) => ({ date: date(0), sector, exchange: 'NASDAQ', averageChange: +(1.5 - index * .7).toFixed(2) }));
  /* The stock wire, which is the one that carries a symbol per story: the ETF
     page keeps the stories tagged with a fund it tracks. Some rows are tagged
     with a company instead, so the filter has something to reject. */
  if (path === 'news/stock-latest') {
    const page = Number(url.searchParams.get('page') || 0);
    const tagged = ['SPY', 'NVDA', 'QQQ', 'AAPL', 'GLD', 'TLT', 'MSFT', 'SCHD', 'XLE', 'JEPI', 'TSLA', 'HYG'];
    return tagged.slice(page * 6, page * 6 + 6).map((symbol, index) => ({
      symbol, publishedDate: new Date(Date.now() - (page * 6 + index) * 5400000).toISOString().slice(0, 19).replace('T', ' '),
      publisher: 'Fixture Newswire', site: 'fixturewire',
      title: `${NAMES[symbol] || FUND_NAMES[symbol] || symbol} draws flows in a synthetic fixture session`,
      text: 'Synthetic fixture copy, not a real story, carried on the wire that files a story under the symbol it is about.',
      url: `https://example.invalid/wire/${symbol}`, image: index % 2 ? thumbnail(symbol, seed(symbol) % 360) : null,
    }));
  }
  if (path === 'news/general-latest') {
    const page = Number(url.searchParams.get('page') || 0);
    return HEADLINES.slice(page * 10, page * 10 + 10).map(([title, publisher, hours]) => ({
      symbol: null, publishedDate: new Date(Date.now() - hours * 3600000).toISOString().slice(0, 19).replace('T', ' '),
      publisher, site: publisher.toLowerCase().replace(/[^a-z]/g, ''), title,
      text: `${title}. Synthetic fixture copy, not a real story, and long enough for the stream to have a second line of summary to clamp.`,
      url: `https://example.invalid/${seed(title)}`,
      image: hours % 3 ? thumbnail('fixture image', seed(title) % 360) : null,
    }));
  }
  if (path === 'treasury-rates') return [{ date: date(-1), month1: 4.55, month2: 4.50, month3: 4.44, month6: 4.30, year1: 4.05,
    year2: 3.93, year3: 3.97, year5: 4.05, year7: 4.13, year10: 4.25, year20: 4.60, year30: 4.57 }];
  if (path === 'economic-indicators') {
    const name = url.searchParams.get('name');
    const series = INDICATOR_SERIES[name];
    if (!series) return [];
    const to = new Date(`${url.searchParams.get('to') || date(0)}T00:00:00Z`);
    const asked = new Date(`${url.searchParams.get('from') || date(-90)}T00:00:00Z`);
    // The vendor caps this feed at 90 days and clips from the `from` end, which
    // is why a series with history costs one request per window.
    const floor = Math.max(+asked, +to - 90 * 864e5);
    // The drift is a function of the observation's own date, not of its place in
    // the window, so the same period carries the same value whichever window
    // asked for it — as a real series does.
    const span = { week: 7, month: 30.44, quarter: 91.3 }[series.step];
    const today = new Date(`${date(0)}T00:00:00Z`);
    const out = [];
    for (let index = 0; index < 40; index++) {
      const at = series.step === 'week' ? new Date(+to - index * 7 * 864e5)
        : series.step === 'quarter' ? new Date(Date.UTC(to.getUTCFullYear(), Math.floor(to.getUTCMonth() / 3) * 3 - index * 3, 1))
          : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - index, 1));
      if (+at > +to) continue;
      if (+at < floor) break;
      const age = Math.round((+today - +at) / (span * 864e5));
      out.push({ name, date: at.toISOString().slice(0, 10), value: +(series.value * (1 - age * .004)).toFixed(3) });
    }
    return out;
  }
  if (path === 'economic-calendar') {
    const upcoming = ['Retail sales', 'Initial jobless claims', 'Industrial production', 'Consumer price index', 'Federal funds rate decision', 'Housing starts', 'Producer price index', 'Consumer confidence'].map((event, index) => ({
      date: `${date(index - 1)} 08:30:00`, country: index === 7 ? 'GB' : 'US', currency: index === 7 ? 'GBP' : 'USD', event,
      actual: index === 0 ? 0 : index > 1 ? null : 220000, estimate: index === 0 ? .2 : 210000, previous: index === 0 ? .3 : 230000,
      impact: ['High', 'Medium', 'Low'][index % 3], unit: index === 0 ? '%' : '',
    }));
    // Reported actuals behind us: what the world maps read. One inflation print
    // per country, GDP for most of them, plus rows the parser must reject.
    const reported = MAP_COUNTRIES.flatMap((country, index) => {
      const code = seed(country);
      const rate = value => +value.toFixed(1);
      const rows = [{ date: `${date(-3 - (index % 45))} 08:00:00`, country, currency: 'USD', event: 'Inflation Rate YoY (Aug)',
        previous: rate(code % 11 - 1), estimate: rate(code % 11 - .5), actual: rate(code % 11 - 1 + (code % 7) / 10),
        change: .2, impact: 'High', changePercentage: 1.1, unit: '%' }];
      if (index % 5 !== 4) rows.push({ date: `${date(-9 - (index % 70))} 06:00:00`, country, currency: 'USD', event: 'GDP Growth Rate YoY (Q2)',
        previous: rate(code % 9 - 3), estimate: rate(code % 9 - 2.5), actual: rate(code % 9 - 3 + (code % 5) / 10),
        change: .1, impact: 'High', changePercentage: .8, unit: '%' });
      if (index % 4 === 0) rows.push({ date: `${date(-9 - (index % 70))} 06:00:00`, country, currency: 'USD', event: 'GDP Growth Rate QoQ (Q2)',
        previous: rate(code % 4 - 1), estimate: null, actual: rate(code % 4 - 1 + (code % 3) / 10), change: 0, impact: 'Medium', unit: '%' });
      // An index level, not a rate: same country, wrong unit, must be ignored.
      if (index % 6 === 0) rows.push({ date: `${date(-4 - (index % 45))} 08:00:00`, country, currency: 'USD', event: 'CPI (Aug)',
        previous: 320.1, estimate: null, actual: 334.98, change: 1, impact: 'Medium', unit: 'Points' });
      return rows;
    });
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    return [...upcoming, ...reported].filter(row => (!from || row.date.slice(0, 10) >= from) && (!to || row.date.slice(0, 10) <= to));
  }
  if (path === 'etf/info' || path === 'etf-info') return [{ symbol: symbols[0], name: `${symbols[0]} test fund`,
    assetsUnderManagement: 1000000000 * seed(symbols[0]), expenseRatio: .15, dividendYield: 2.5, nav: fixtureQuote(symbols[0]).price,
  }];
  if (path === 'stock-price-change') return symbols.map(symbol => Object.fromEntries([['symbol', symbol],
    ...['1D', '5D', '1M', '3M', '6M', 'ytd', '1Y', '3Y', '5Y', '10Y', 'max'].map((window, index) => [window, +(seed(symbol) % 40 / 4 + index).toFixed(2)])]));
  if (path.includes('dividend')) return [{ date: date(-30), dividend: 1.5, adjDividend: 1.5 }];
  throw new Error(`UI fixture does not implement ${path}`);
}

export function createFixtureFetch(calls = []) {
  const realFetch = globalThis.fetch?.bind(globalThis);
  return async input => {
    const url = new URL(String(input), globalThis.location?.href || 'http://localhost/');
    // Same-origin files — the country boundaries the maps draw — are the page's
    // own assets, not the network. Everything else off FMP stays blocked.
    if (globalThis.location && url.origin === globalThis.location.origin) return realFetch(input);
    if (url.hostname !== 'financialmodelingprep.com') throw new Error('Fixture test blocked a non-FMP request');
    if (url.searchParams.get('apikey') !== FIXTURE_KEY) throw new Error('Fixture requests must use the synthetic test key');
    calls.push(`${url.pathname}?${new URLSearchParams([...url.searchParams].filter(([key]) => key !== 'apikey'))}`);
    try { return new Response(JSON.stringify(fixturePayload(url)), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    catch (error) { return new Response(JSON.stringify({ 'Error Message': error.message }), { status: 404, headers: { 'Content-Type': 'application/json' } }); }
  };
}
