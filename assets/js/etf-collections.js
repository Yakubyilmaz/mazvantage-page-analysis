/* The ETF screener's collections.

   The stock screener has forty screens behind it because a stock can be graded.
   A fund cannot: nothing in this product scores a basket, so an ETF collection
   is only ever a *selection* — a rule over the listings FMP's screener already
   returned, applied to rows that are on the page anyway. No collection here
   costs a request.

   That leaves two kinds of rule, and the difference matters enough to be
   printed under the dropdown:

   - **A number the feed returned.** Size, volume, distribution yield and beta
     are fields on the screener row. These collections are exact.
   - **What the fund's own name says it holds.** FMP's screener carries no
     asset class for a fund, so a gold fund is a fund that says gold. This is a
     rule about names and is labelled as one — it finds the funds named after
     their holding and misses any that are not.

   Everything else TradingView files under ETF collections needs a number this
   vendor does not publish — flows, expense ratios, NAV premiums, whole-market
   one-year returns — and those stay in the list saying exactly that, rather
   than being quietly dropped or, worse, estimated. */

/** A word match that does not fire inside a longer word. */
const word = (...terms) => new RegExp(`(?:^|[^a-z0-9])(?:${terms.join('|')})(?![a-z0-9])`, 'i');
const nameOf = row => `${row.companyName || row.name || ''} ${row.symbol || ''}`;
const has = (re) => (row) => re.test(nameOf(row));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const yieldOf = row => (finite(row.price) && row.price > 0 && finite(row.lastAnnualDividend)
  ? row.lastAnnualDividend / row.price * 100 : null);

/* Gold is the trap this file is most likely to fall into: `Goldman` is not
   gold, the same boundary case the futures news matcher documents. */
const GOLD = /(?:^|[^a-z0-9])gold(?!man)(?![a-z0-9])/i;
/* `Short` is the other one: half the bond funds on the exchange are short
   *term*, and none of them is an inverse fund. */
const INVERSE = /(?:^|[^a-z0-9])(?:inverse|bear|ultrashort|short(?!\s*[- ]?(?:term|duration|maturit|treasur))|-1x)(?![a-z0-9])/i;
const LEVERAGED = /(?:^|[^a-z0-9])(?:\d(?:\.\d)?x|ultra|ultrapro|leveraged?|bull)(?![a-z0-9])/i;
/* A mandate that is not one country: the world, a region, or a development
   bucket. `ACWI` and `EAFE` are index names a fund states in place of the
   words, so they count as the words. */
/* `Global X` is an issuer with ninety funds and a uranium miner is not a world
   mandate, so `global` is the one term here that has to say what it is not —
   the same trap as `Goldman` in the gold rule above. */
const GLOBAL_WORDS = new RegExp([
  /(?:^|[^a-z0-9])global(?!\s*x(?![a-z0-9]))(?![a-z0-9])/i.source,
  word('world', 'all[- ]world', 'acwi', 'eafe', 'international', 'developed markets?',
    'emerging markets?', 'frontier markets?', 'ex[- ]us', 'worldwide', 'total international').source,
].join('|'), 'i');

/* The countries a fund names. Ordered by nothing in particular; the rule only
   asks whether one of them appears as a word. */
const COUNTRY_WORDS = word('usa', 'united states', 'canada', 'canadian', 'mexico', 'mexican', 'brazil', 'brazilian',
  'argentina', 'chile', 'colombia', 'peru', 'united kingdom', 'britain', 'british', 'germany', 'german',
  'france', 'french', 'netherlands', 'dutch', 'switzerland', 'swiss', 'spain', 'spanish', 'italy', 'italian',
  'sweden', 'swedish', 'norway', 'norwegian', 'denmark', 'danish', 'finland', 'finnish', 'austria', 'austrian',
  'belgium', 'belgian', 'ireland', 'irish', 'portugal', 'portuguese', 'greece', 'greek', 'poland', 'polish',
  'turkey', 'turkish', 'israel', 'israeli', 'russia', 'russian', 'south africa', 'nigeria', 'egypt', 'kenya',
  'saudi', 'qatar', 'kuwait', 'uae', 'emirates', 'japan', 'japanese', 'china', 'chinese', 'hong kong',
  'taiwan', 'korea', 'korean', 'india', 'indian', 'indonesia', 'malaysia', 'singapore', 'thailand', 'thai',
  'vietnam', 'philippines', 'pakistan', 'bangladesh', 'australia', 'australian', 'new zealand');

const SECTOR_WORDS = word('select sector', 'sector', 'technology', 'semiconductor', 'health ?care', 'biotech\\w*',
  'financials?', 'banks?', 'energy', 'industrials?', 'utilities', 'materials?', 'consumer', 'communication',
  'insurance', 'transport\\w*', 'aerospace', 'homebuilders?', 'retail', 'infrastructure');

/* What a fund has to *say* to be something other than equity. Built from the
   rules below it so the two can never drift apart. */
const NON_EQUITY = new RegExp([
  /(?:^|[^a-z0-9])(?:bonds?|treasur[a-z]*|gilts?|municipals?|muni|aggregate|fixed income|tips|t-bills?|bills?|notes?|credit|high yield|corporates?|duration|maturity)(?![a-z0-9])/i.source,
  /(?:^|[^a-z0-9])(?:commodit[a-z]*|crude|wti|brent|natural gas|silver|platinum|palladium|copper|precious metals?|agricultur[a-z]*|livestock|corn|wheat|soybeans?)(?![a-z0-9])/i.source,
  /(?:^|[^a-z0-9])(?:bitcoin|btc|ethereum|ether|eth|crypto[a-z]*)(?![a-z0-9])/i.source,
  /(?:^|[^a-z0-9])(?:real estate|reits?|property|mortgage)(?![a-z0-9])/i.source,
  GOLD.source,
  LEVERAGED.source,
  INVERSE.source,
].join('|'), 'i');

/**
 * `sort` is the column the collection opens on, from `FUND_COLUMN_SETS`;
 * `test` selects rows; `note` is printed beside the count, because a rule the
 * reader cannot see is a rule they cannot check.
 */
export const ETF_COLLECTIONS = [
  { id: 'all', title: 'All ETFs', group: 'Market Collections',
    note: 'Every fund FMP lists for this country.' },
  { id: 'largest', title: 'Largest funds', group: 'Market Collections',
    sort: { key: 'marketCap', direction: -1 }, test: row => finite(row.marketCap) && row.marketCap > 0,
    note: 'Ranked on the market value FMP returns for the fund. This is the vendor’s figure, not a published net-asset total.' },
  { id: 'most-traded', title: 'Most traded', group: 'Market Collections',
    sort: { key: 'volume', direction: -1 }, test: row => finite(row.volume) && row.volume > 0,
    note: 'Ranked on the latest session’s share volume.' },
  { id: 'highest-yield', title: 'Highest distribution yield', group: 'Market Collections',
    sort: { key: 'divYield', direction: -1 }, test: row => finite(yieldOf(row)) && yieldOf(row) > 0,
    note: 'Distributions declared over the trailing year divided by the latest price. It is not SEC yield.' },
  { id: 'dividend', title: 'Dividend payers', group: 'Market Collections',
    sort: { key: 'divYield', direction: -1 }, test: row => finite(row.lastAnnualDividend) && row.lastAnnualDividend > 0,
    note: 'Funds that declared a distribution over the trailing year.' },
  { id: 'highest-beta', title: 'Highest beta', group: 'Market Collections',
    sort: { key: 'beta', direction: -1 }, test: row => finite(row.beta),
    note: 'Beta as FMP reports it for the fund, against the US market.' },
  { id: 'lowest-beta', title: 'Lowest beta', group: 'Market Collections',
    sort: { key: 'beta', direction: 1 }, test: row => finite(row.beta) && row.beta >= 0,
    note: 'Beta as FMP reports it for the fund, against the US market.' },
  { id: 'negative-beta', title: 'Negative beta', group: 'Market Collections',
    sort: { key: 'beta', direction: 1 }, test: row => finite(row.beta) && row.beta < 0,
    note: 'Funds FMP reports as moving against the US market.' },

  /* Equity is the one holding a fund's name does not state: nothing is called
     an equity fund, they are called S&P 500, Total Stock Market, Russell 2000.
     So it is the residue — what is left once the holdings that *are* named are
     taken out — and the page says that rather than claiming an asset class the
     vendor never returned. */
  { id: 'equity', title: 'Equity', group: 'What the fund holds',
    test: row => !NON_EQUITY.test(nameOf(row)),
    note: 'What is left once the funds naming a bond, commodity, crypto, property or multiple holding are taken out. FMP returns no asset class for a fund, so this is a residue rather than a classification.' },
  { id: 'bond', title: 'Fixed income', group: 'What the fund holds',
    test: has(word('bonds?', 'treasur\\w*', 'gilts?', 'municipals?', 'muni', 'aggregate', 'fixed income',
      'tips', 't-bills?', 'bills?', 'notes?', 'credit', 'high yield', 'corporates?', 'duration', 'maturity')),
    note: 'Funds whose name states a bond, treasury, credit or money-market holding.' },
  { id: 'commodities', title: 'Commodities', group: 'What the fund holds',
    test: has(word('commodit\\w*', 'crude', 'wti', 'brent', 'natural gas', 'silver', 'platinum', 'palladium',
      'copper', 'precious metals?', 'agricultur\\w*', 'livestock', 'corn', 'wheat', 'soybeans?')),
    note: 'Funds whose name states a commodity holding. Energy and mining *equity* funds are named after companies and stay out.' },
  { id: 'gold', title: 'Gold', group: 'What the fund holds', test: has(GOLD),
    note: 'Funds whose name states gold. Goldman is not gold, and the rule says so.' },
  { id: 'bitcoin', title: 'Bitcoin', group: 'What the fund holds',
    test: has(word('bitcoin', 'btc')), note: 'Funds whose name states a bitcoin holding.' },
  { id: 'ethereum', title: 'Ethereum', group: 'What the fund holds',
    test: has(word('ethereum', 'ether', 'eth')), note: 'Funds whose name states an ether holding.' },
  { id: 'real-estate', title: 'Real estate', group: 'What the fund holds',
    test: has(word('real estate', 'reits?', 'property', 'mortgage')),
    note: 'Funds whose name states a real-estate or mortgage holding.' },
  { id: 'total-market', title: 'Total market', group: 'What the fund holds',
    test: has(word('total (?:stock )?market', 'total world', 'total international', 'broad market', 'core s&p', 'whole market')),
    note: 'Funds whose name claims the whole market rather than a slice of it.' },
  /* A mandate wider than any one country. The opposite rule to `country`
     below it, and the two together are how the World view of Market Data is
     put together: the funds that hold everything, and the funds that hold one
     market each. Equity again — a global *bond* fund is a bond fund. */
  { id: 'global', title: 'World and global', group: 'What the fund holds',
    test: row => GLOBAL_WORDS.test(nameOf(row)) && !NON_EQUITY.test(nameOf(row)),
    note: 'Funds whose name states a mandate wider than one country — world, global, international, developed or emerging markets. Bond, commodity and leveraged funds are taken out, as they are from the equity collection.' },

  /* One market, named. Deliberately wider than the Market Data picker's own
     country list — a reader looking for country funds wants Vietnam and Peru
     as much as Japan — and deliberately equity: a fund calling itself China
     Government Bond is a bond fund that happens to name a country, and the
     same `NON_EQUITY` rule that keeps bonds and bullion out of the equity
     collection keeps them out of this one. `US` alone is not in the list: it
     opens `US Treasury` and `US Aggregate` far more often than it opens a
     country fund, so the spelt-out forms carry it. */
  { id: 'country', title: 'Country funds', group: 'What the fund holds',
    test: row => COUNTRY_WORDS.test(nameOf(row)) && !NON_EQUITY.test(nameOf(row)),
    note: 'Funds whose name states a single country, with the bond, currency, commodity and leveraged ones taken out. A regional or emerging-market fund names no one country and stays out.' },
  { id: 'sector', title: 'Sector funds', group: 'What the fund holds', test: has(SECTOR_WORDS),
    note: 'Funds whose name states a sector or industry. A fund tracking a sector without naming it stays out.' },
  { id: 'leveraged', title: 'Leveraged', group: 'What the fund holds',
    test: row => LEVERAGED.test(nameOf(row)) && !INVERSE.test(nameOf(row)),
    note: 'Funds whose name states a multiple of an index — 2x, 3x, Ultra, Bull. The multiple is the fund’s own claim.' },
  { id: 'inverse', title: 'Inverse', group: 'What the fund holds', test: has(INVERSE),
    note: 'Funds whose name states an inverse or bear exposure. A short-*term* bond fund is not one, and the rule excludes it.' },
  /* The Shariah screen in this product is a balance-sheet test on a company.
     A fund is a basket, so there is nothing to run it against: what can be
     honestly said is which funds state the mandate themselves. */
  { id: 'shariah', title: 'Shariah', group: 'What the fund holds',
    test: has(word('shariah', 'sharia', 'islamic', 'halal', 'sukuk')),
    note: 'Funds whose name states a Shariah, Islamic or sukuk mandate. This is the fund’s own claim — the balance-sheet screen this product runs on a company cannot be run on a basket.' },

];

/* What is not in that list, and why — kept here rather than as dead entries in
   the dropdown, which is a list of things a reader can actually pick:
   **flows** (in and out) and **AUM growth** need a second, older assets figure
   or the money that moved, and FMP publishes neither; an **expense ratio**
   comes one fund at a time, which is a request per listing; **one-year returns**
   and **session gainers and losers** are the same arithmetic — the screener
   feed carries no change and no return, so ranking the whole market on either
   would be a request per fund (the ETFs page ranks the funds it already quotes
   instead); and **asset allocation** and **actively managed** are mandates the
   feed does not return and a fund's name does not reliably state. */

export const etfCollection = id => ETF_COLLECTIONS.find(item => item.id === id) || ETF_COLLECTIONS[0];

/** The funds in one collection, largest first — what a section on the ETFs
 *  page shows, and the same rule the screener applies to the same listings. */
export function fundsIn(rows, id, limit = 6) {
  const collection = etfCollection(id);
  if (!collection.test) return (rows || []).slice(0, limit);
  const key = collection.sort?.key === 'volume' ? 'volume' : 'marketCap';
  const direction = collection.sort?.direction === 1 ? 1 : -1;
  return (rows || []).filter(row => collection.test(row))
    .sort((a, b) => ((finite(a[key]) ? a[key] : -Infinity) - (finite(b[key]) ? b[key] : -Infinity)) * direction)
    .slice(0, limit);
}
