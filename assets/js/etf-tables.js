/* ==========================================================================
   Maz Vantage — the curated ETF tables

   Seventeen boards of named funds, each one a question about the market that a
   list of funds answers: what the indices did, what the sectors did, what the
   themes inside a sector did, what the world outside the United States did.

   ---------------------------------------------------------------------------
   Why a hand-written catalogue rather than a screen
   ---------------------------------------------------------------------------

   The ETF screener next door already answers "which funds exist" — five
   thousand of them, filtered on the numbers the vendor returns. It cannot
   answer "what did gold do today", because there is no field on a fund that
   says *gold*, and the name rule `etf-collections.js` uses to guess finds the
   funds named after their holding and misses the ones that are not.

   A board is the other half of that. Somebody chose GLD to stand for gold and
   XLK to stand for technology, and once that choice is made the table is exact
   rather than approximate. The cost is that the choice is maintained by hand,
   and a fund that closes leaves a row with no quote behind it — which is why
   every row prints a dash rather than disappearing. A gap stays visible as a
   gap.

   ---------------------------------------------------------------------------
   Everything here is a fund, and three boards say what they left out
   ---------------------------------------------------------------------------

   The products these boards are modelled on mix instruments freely: their bond
   board leads with the Treasury curve, their currency board with spot rates,
   their crypto board with coins. None of those is an exchange-traded fund, and
   this is the ETF page — so each of the three carries the funds and a line
   saying where the underlying lives in this product instead. The curve is on
   Market Data → Economy; the coins and the spot rates are quoted on the
   Markets hub. Nothing is silently dropped and nothing is silently relabelled.

   ---------------------------------------------------------------------------
   Two feeds per board
   ---------------------------------------------------------------------------

   `batch-quote` for the price, the session and the two ranges; `stock-price-
   change` for the five return windows. Both take a symbol list, so a board of
   ninety funds costs four requests rather than ninety, and a board is only
   fetched when it is opened.
   ========================================================================== */

import { isNum } from './util.js';
import { fetchBatchQuotes, fetchHubFeed, hasApiKey } from './fmp.js';

/* ==========================================================================
   The catalogue
   ========================================================================== */

/**
 * One table: a heading, its rows, and an optional caveat.
 *
 * A row is `[label, symbol]`, or `[label, symbol, hint]` where the hint
 * replaces the vendor's fund name on the second line. That third element
 * exists for the one board that leaves the United States: a row quoted in
 * pence on the London exchange and a row quoted in dollars need to say which
 * they are, in the row itself, rather than in a note above a table somebody
 * has already started reading down.
 */
const g = (title, funds, note = null) => ({ title, funds, note });

export const ETF_TABLE_CATEGORIES = [
  {
    id: 'key-markets',
    title: 'Key market data',
    short: 'Key markets',
    blurb: 'One fund per thing a market report opens with: the US indices, the eleven sectors, '
      + 'the factor tilts, the world outside them, the big bond and commodity exposures, and '
      + 'the dollar.',
    groups: [
      g('US equities', [['S&P 500', 'SPY'], ['Dow Jones Industrial Average', 'DIA'],
        ['Nasdaq 100', 'QQQ'], ['Mid cap', 'MDY'], ['Small cap', 'IJR'], ['Micro cap', 'IWC']]),
      g('US equity sectors', [['Technology', 'XLK'], ['Healthcare', 'XLV'],
        ['Consumer staples', 'XLP'], ['Utilities', 'XLU'], ['Consumer discretionary', 'XLY'],
        ['Communication services', 'XLC'], ['Basic materials', 'XLB'],
        ['Financial services', 'XLF'], ['Industrials', 'XLI'], ['Energy', 'XLE'],
        ['Real estate', 'XLRE']]),
      g('US equity factors', [['Value', 'IUSV'], ['Growth', 'IUSG'], ['Quality', 'QUAL'],
        ['Low volatility', 'USMV'], ['High dividend yield', 'VYM'], ['Momentum', 'MTUM'],
        ['Dividend growth', 'DGRO'], ['Equal weight', 'RSP']]),
      g('Global equities', [['World equities', 'ACWI'], ['Emerging markets', 'IEMG'],
        ['World ex-US', 'SPDW'], ['Developed markets', 'VEA'], ['EAFE', 'IEFA']]),
      g('Countries', [['United States', 'VTI'], ['United Kingdom', 'EWU'], ['Germany', 'EWG'],
        ['France', 'EWQ'], ['Japan', 'EWJ'], ['China', 'MCHI'], ['Brazil', 'EWZ']]),
      g('Bonds', [['20+ year Treasuries', 'TLT'], ['US aggregate', 'BND'], ['US TIPS', 'TIP'],
        ['US high yield', 'HYG'], ['International government', 'BWX'],
        ['Short-term corporate', 'VCSH']]),
      g('Commodities', [['Gold', 'GLD'], ['Silver', 'SLV'], ['Platinum', 'PPLT'],
        ['Industrial metals', 'DBB'], ['Oil', 'DBO'], ['Natural gas', 'UNG'],
        ['Agriculture', 'DBA'], ['Corn', 'CORN'], ['Soybeans', 'SOYB']]),
      g('Currencies', [['US dollar', 'UUP'], ['Euro', 'FXE'], ['British pound', 'FXB'],
        ['Japanese yen', 'FXY']],
      'Currency funds, not spot rates. The rates themselves are quoted on the Markets hub.'),
    ],
  },

  {
    id: 'sectors',
    title: 'Sectors',
    short: 'Sectors',
    blurb: 'The eleven US sectors at three grains: the large-cap SPDRs everyone quotes, the '
      + 'small-cap equivalents, and the global version of each.',
    groups: [
      g('US sectors', [['Basic materials', 'XLB'], ['Communication services', 'XLC'],
        ['Consumer discretionary', 'XLY'], ['Consumer staples', 'XLP'], ['Energy', 'XLE'],
        ['Financial services', 'XLF'], ['Healthcare', 'XLV'], ['Industrials', 'XLI'],
        ['Technology', 'XLK'], ['Utilities', 'XLU'], ['Real estate', 'XLRE']]),
      g('US sectors — small cap', [['Consumer discretionary', 'PSCD'],
        ['Consumer staples', 'PSCC'], ['Healthcare', 'PSCH'], ['Financials', 'PSCF'],
        ['Energy', 'PSCE'], ['Industrials', 'PSCI'], ['Basic materials', 'PSCM'],
        ['Utilities', 'PSCU'], ['Technology', 'PSCT']],
      'The same eleven sectors inside the S&P 600. Small-cap sector funds are thinly traded, '
        + 'and a day range far wider than the large-cap row beside it usually says so.'),
      g('Global sectors', [['Basic materials', 'MXI'], ['Consumer discretionary', 'RXI'],
        ['Consumer staples', 'KXI'], ['Energy', 'IXC'], ['Financial services', 'IXG'],
        ['Healthcare', 'IXJ'], ['Industrials', 'EXI'], ['Technology', 'IXN'],
        ['Telecommunications', 'IXP'], ['Utilities', 'JXI']]),
    ],
  },

  {
    id: 'themes',
    title: 'Themes & subsectors',
    short: 'Themes',
    blurb: 'Inside the eleven sectors: the industries and themes a fund exists for. This is the '
      + 'board that says what actually moved when technology was up.',
    groups: [
      g('Alternative energy', [['Environmental services', 'EVX'], ['Nuclear', 'NLR'],
        ['Solar', 'TAN'], ['Wind', 'FAN'], ['Clean energy', 'PBD']]),
      g('Consumer', [['Food & beverage', 'PBJ'], ['Homebuilders', 'XHB'], ['Retail', 'XRT'],
        ['Online retail', 'IBUY'], ['Leisure & entertainment', 'PEJ'], ['Gaming', 'BJK'],
        ['Millennials', 'MILN']]),
      g('Energy', [['Oil & gas exploration and production', 'PXE'],
        ['Oil & gas equipment and services', 'PXJ'], ['Energy infrastructure', 'ENFR'],
        ['Natural gas producers', 'FCG'], ['Uranium', 'URA']]),
      g('Financials', [['Broker-dealers', 'IAI'], ['Private equity', 'PSP'],
        ['Property & casualty insurance', 'KBWP'], ['Capital markets', 'KCE'],
        ['Insurance', 'KIE'], ['Banks', 'KBWB'], ['Regional banks', 'KRE']]),
      g('Healthcare', [['Biotech', 'PBE'], ['Pharmaceuticals', 'PJP'],
        ['Healthcare providers', 'IHF'], ['Medical devices', 'IHI'],
        ['Medical equipment', 'XHE'], ['Genomics', 'ARKG']]),
      g('Industrials & infrastructure', [['Transport', 'IYT'], ['Aerospace & defence', 'PPA'],
        ['Global infrastructure', 'GII'], ['Global water', 'PIO'], ['Shipping', 'SEA'],
        ['Airlines', 'JETS'], ['Auto manufacturers', 'CARZ'], ['Autonomous vehicles', 'IDRV']]),
      g('Materials, metals and mining', [['Gold miners', 'GDX'],
        ['Junior gold miners', 'GDXJ'], ['Hard-asset producers', 'HAP'],
        ['Metals & mining', 'XME'], ['Steel', 'SLX'], ['Silver miners', 'SIL'],
        ['Timber', 'WOOD'], ['Copper producers', 'COPX']],
      'Miners are equities, not metal. A gold-miner fund is levered to the gold price through '
        + 'a cost base, which is why it rarely matches GLD on the commodities board.'),
      g('Technology', [['Semiconductors', 'SMH'], ['Software', 'IGV'], ['Networking', 'IGN'],
        ['Internet', 'PNQI'], ['Cloud computing', 'SKYY'], ['Social media', 'SOCL'],
        ['Robotics', 'ROBO'], ['Blockchain technology', 'BLOK'],
        ['Artificial intelligence & big data', 'AIQ'], ['Cybersecurity', 'CIBR'],
        ['Gaming & esports', 'ESPO'], ['Next-generation connectivity', 'NXTG']]),
      g('Utilities', [['Smart grid', 'GRID'], ['Global utilities', 'JXI']]),
    ],
  },

  {
    id: 'market-cap',
    title: 'Market cap',
    short: 'Market cap',
    blurb: 'The same market cut by size, once per index family — because large, mid and small '
      + 'mean slightly different things to S&P, Russell, Dow Jones and Morningstar.',
    groups: [
      g('S&P indexes', [['Large cap', 'SPY'], ['Mid cap', 'MDY'], ['Small cap', 'IJR']]),
      g('Dow Jones indexes', [['Large cap', 'SCHX'], ['Mid cap', 'SCHM'], ['Small cap', 'SCHA'],
        ['Micro cap', 'FDM']]),
      g('Russell indexes', [['Large cap', 'IWB'], ['Mid cap', 'IWR'], ['Small cap', 'IWM'],
        ['Micro cap', 'IWC']]),
      g('Morningstar indexes', [['Large cap', 'ILCB'], ['Mid cap', 'IMCB'],
        ['Small cap', 'ISCB']]),
      g('Equal weight', [['S&P 500', 'RSP'], ['Nasdaq 100', 'QQEW']],
      'Equal weight is a size decision in disguise: it sells the largest names down to the '
        + 'same weight as the smallest, so it reads as a mid-cap tilt on the S&P 500.'),
      g('Low volatility', [['Large cap', 'SPLV'], ['Mid cap', 'XMLV'], ['Small cap', 'XSLV']]),
      g('Fundamentally weighted', [['Large cap', 'PRF'], ['Small & mid cap', 'PRFZ']]),
    ],
  },

  {
    id: 'growth-value',
    title: 'Growth vs. value',
    short: 'Growth vs. value',
    blurb: 'The oldest spread in the market, at every size and by every index provider. Read '
      + 'the pairs against each other rather than each row on its own.',
    groups: [
      g('Broad markets', [['US market growth', 'IUSG'], ['US market value', 'IUSV'],
        ['Developed markets growth', 'EFG'], ['Developed markets value', 'EFV']]),
      g('Russell indexes', [['Large cap growth', 'IWF'], ['Large cap value', 'IWD'],
        ['Mid cap growth', 'IWP'], ['Mid cap value', 'IWS'], ['Small cap growth', 'IWO'],
        ['Small cap value', 'IWN']]),
      g('Morningstar indexes', [['Large cap growth', 'ILCG'], ['Large cap value', 'ILCV'],
        ['Mid cap growth', 'IMCG'], ['Mid cap value', 'IMCV'], ['Small cap growth', 'ISCG'],
        ['Small cap value', 'ISCV']]),
      g('S&P indexes', [['Large cap growth', 'SPYG'], ['Large cap value', 'SPYV'],
        ['Mid cap growth', 'MDYG'], ['Mid cap value', 'MDYV'], ['Small cap growth', 'SLYG'],
        ['Small cap value', 'SLYV']]),
    ],
  },

  {
    id: 'smart-beta',
    title: 'Smart beta',
    short: 'Smart beta',
    blurb: 'Index funds that weight by something other than size. Each row is one rule applied '
      + 'to one universe, which is what makes the columns comparable down a group.',
    groups: [
      g('Low volatility — US', [['S&P 500', 'SPLV'], ['S&P 400', 'XMLV'], ['S&P 600', 'XSLV'],
        ['Russell 1000', 'LGLV'], ['Russell 2000', 'SMLV'], ['Broad market', 'USMV']]),
      g('Equal weighted — US', [['Nasdaq 100', 'QQEW'], ['S&P 500', 'RSP'],
        ['Russell 1000', 'EQAL'], ['Russell top 200', 'EQWL']]),
      g('Fundamentally weighted — US', [['Large cap', 'PRF'], ['Small & mid cap', 'PRFZ'],
        ['Total market', 'FNDB']]),
      g('Momentum — US', [['S&P 500', 'SPMO'], ['Broad market', 'PDP'], ['S&P 1500', 'MMTM'],
        ['Small cap', 'DWAS']]),
      g('Other factors — US', [['Quality, large cap', 'SPHQ'], ['Quality, broad', 'QUAL'],
        ['High beta, large cap', 'SPHB']]),
      g('Low volatility — international', [['Developed markets', 'IDLV'],
        ['Emerging markets', 'EELV'], ['Global markets', 'ACWV']]),
      g('Fundamental — international', [['Developed markets', 'PXF'],
        ['Developed small & mid cap', 'PDN'], ['Emerging markets', 'PXH']]),
      g('Quality — international', [['Developed markets', 'IQLT'], ['Global markets', 'QWLD'],
        ['Global dividends', 'IQDF']]),
      g('Momentum and high beta — international', [['Developed momentum', 'PIZ'],
        ['Emerging momentum', 'PIE'], ['Developed high beta', 'IDMO'],
        ['Emerging high beta', 'EEMO']]),
    ],
  },

  {
    id: 'dividends',
    title: 'Dividends',
    short: 'Dividends',
    blurb: 'Income funds by where the income comes from and how it is selected — yield, growth, '
      + 'earnings weight, or a record of raises.',
    note: 'Every return column on this board is a price return. A dividend fund gives up part '
      + 'of its price move as cash, so these columns understate what an owner received, and by '
      + 'roughly the yield.',
    groups: [
      g('US dividends', [['US large cap', 'DLN'], ['US mid cap', 'DON'], ['US small cap', 'DES'],
        ['US total market', 'DTD'], ['US high dividend', 'VYM']]),
      g('Global dividends', [['World ex-US', 'DTH'], ['World ex-US large cap', 'DOL'],
        ['World ex-US mid cap', 'DIM'], ['World ex-US small cap', 'DLS'],
        ['International high yield, rising dividends', 'PID']]),
      g('Regional dividends', [['Emerging markets', 'DEM'],
        ['Emerging markets small cap', 'DGS'], ['Europe', 'FDD'], ['Europe small cap', 'DFE'],
        ['Japan', 'DXJ'], ['Japan small cap', 'DFJ']]),
      g('Earnings weighted', [['US large cap', 'EPS'], ['US mid cap', 'EZM'],
        ['US small cap', 'EES']]),
      g('Dividend strategies', [['Dividend equity', 'SCHD'], ['Dividend growth', 'DGRO'],
        ['Dividend appreciation', 'VIG'], ['Dividend aristocrats', 'NOBL'],
        ['High yield, rising dividends', 'SDY'], ['Rising dividends', 'PFM'],
        ['Value Line dividend index', 'FVD'], ['Preferred stock', 'PFF'],
        ['Financial preferred stock', 'PGF'], ['Buybacks', 'PKW']],
      'The aristocrat and champion funds themselves are here; the underlying company lists are not built '
        + 'anywhere in this product, and that is a data gap rather than an oversight — both are '
        + 'defined by a run of consecutive annual raises, and no screening path here carries '
        + 'dividend history. The income screens on Investment Ideas test the earnings and cash '
        + 'behind a payout instead, and say so.'),
    ],
  },

  {
    id: 'strategies',
    title: 'Strategies',
    short: 'Strategies',
    blurb: 'Funds that are a trade rather than an index: buybacks, spin-offs, merger arbitrage, '
      + 'moats, hedged equity and the risk tilts.',
    groups: [
      g('Equity strategies', [['Buybacks', 'PKW'], ['International buybacks', 'IPKW'],
        ['Buy-write', 'PBP'], ['Wide moat', 'MOAT'], ['Equal-weight sectors', 'EQL'],
        ['Merger arbitrage', 'MNA'], ['Spin-offs', 'CSD'], ['US IPOs', 'FPX'],
        ['Closed-end funds', 'CEFS'], ['Guru picks', 'GURU']]),
      g('Risk and volatility', [['High beta', 'SPHB'], ['Low volatility', 'SPLV'],
        ['High quality', 'SPHQ'], ['Hedged equity', 'PHDG'], ['Hedge multi-strategy', 'QAI'],
        ['International hedged equity', 'HEDJ']]),
      g('Mixed fundamentals', [['Developed markets ex-US', 'PXF'],
        ['Developed ex-US small & mid cap', 'PDN'], ['Emerging markets', 'PXH'],
        ['US 1000', 'PRF'], ['US 1500 small & mid cap', 'PRFZ']]),
      g('Environmental, social and governance', [['Social', 'DSI'], ['ESG — US', 'SUSL'],
        ['ESG — global', 'ESGG'], ['Women in leadership', 'SHE'], ['Environmental', 'ETHO']],
      'A fund’s ESG mandate is its own claim about its holdings. Nothing in this product tests '
        + 'it, and there is no ESG score anywhere on a company report.'),
      g('Asset allocation', [['Aggressive', 'AOA'], ['Growth', 'AOR'], ['Moderate', 'AOM'],
        ['Conservative', 'AOK']]),
    ],
  },

  {
    id: 'shariah',
    title: 'Shariah funds',
    short: 'Shariah',
    blurb: 'Every Shariah-compliant exchange-traded fund and mutual fund this vendor quotes, '
      + 'wherever it is listed. The equity funds screen out the excluded lines of business and '
      + 'apply balance-sheet limits; the sukuk funds hold certificates of ownership rather than '
      + 'interest-bearing debt.',
    note: 'A fund is on this board because it states the mandate itself, and that claim is '
      + 'the fund’s, not this product’s. Nothing here re-screens a basket: the AAOIFI ratio test '
      + 'the Shariah pages run is a test on a company’s balance sheet, and a fund has no balance '
      + 'sheet of its own. Which board a fund sits under, which scholars certify it and how it '
      + 'purifies incidental income are all the issuer’s disclosures — read them before relying '
      + 'on the row. See Shariah → Methodology and Shariah → Purification for what this product '
      + 'does and does not test.',
    groups: [
      g('US equity', [['S&P 500, industry exclusions', 'SPUS'],
        ['FTSE USA Shariah', 'HLAL'], ['Russell US broad market, halal', 'MNZL'],
        ['Amana Growth', 'AMGR'], ['Amana Equity Income', 'AMEI']],
      'US-listed and quoted in dollars, like every other board here. These four track different '
        + 'index families, so a gap between them down the return columns is a difference in what '
        + 'each index excluded rather than in the screen itself.'),
      g('Global and emerging equity', [['Dow Jones Islamic World', 'UMMA'],
        ['S&P World ex-US', 'SPWO'], ['S&P Global Technology', 'SPTE'],
        ['Amana Developing World', 'AMEM']]),
      g('Sukuk, income and property', [['Dow Jones Global Sukuk', 'SPSK'],
        ['Wahed alternative income', 'KWIN'], ['S&P Global REIT Shariah', 'SPRE']],
      'A sukuk is a share of an asset and the income is rent on it, which is why these sit here '
        + 'rather than on the bond board — and why their return columns behave like a bond fund’s '
        + 'all the same, because the market prices them against the same yield curve.'),
      g('US mutual funds', [
        ['Amana Income', 'AMANX', 'Mutual fund · investor class'],
        ['Amana Income', 'AMINX', 'Mutual fund · institutional class'],
        ['Amana Growth', 'AMAGX', 'Mutual fund · investor class'],
        ['Amana Growth', 'AMIGX', 'Mutual fund · institutional class'],
        ['Amana Developing World', 'AMDWX', 'Mutual fund · investor class'],
        ['Amana Developing World', 'AMIDX', 'Mutual fund · institutional class'],
        ['Iman Fund', 'IMANX', 'Mutual fund · class K'],
        ['Azzad Ethical Fund', 'ADJEX', 'Mutual fund']],
      'Not exchange-traded. A mutual fund prices once a day at its net asset value, so the day '
        + 'range on these rows is a single point and the session column only moves after the '
        + 'close — that is the instrument, not a gap in the feed. Both share classes are listed '
        + 'where the vendor quotes both: they hold the same portfolio and differ in fee, which is '
        + 'the spread you will see open up down the longer columns.'),
      g('Listed in London', [
        ['iShares MSCI USA Islamic', 'ISDU.L', 'LSE · USD'],
        ['iShares MSCI World Islamic', 'ISDW.L', 'LSE · USD'],
        ['iShares MSCI EM Islamic', 'ISDE.L', 'LSE · USD'],
        ['Invesco Dow Jones Islamic Global Developed', 'IGDA.L', 'LSE · USD'],
        ['HSBC Global Sukuk', 'HBKU.L', 'LSE · USD'],
        ['Saturna Al-Kawthar Global Focused Equity', 'AMAL.L', 'LSE · USD']],
      'The one board on this page that leaves the United States, because most of the world’s '
        + 'Shariah funds are UCITS and a US-only list would have been a short and misleading one. '
        + 'The dollar lines are listed here; several of these also trade in sterling under a '
        + 'second ticker, which would put pence in the price column beside dollars.'),
      g('Listed in continental Europe', [
        ['HSBC MSCI World Islamic ESG', 'HIWO.SW', 'SIX · USD'],
        ['HSBC MSCI Europe Islamic ESG', 'HIEU.SW', 'SIX · USD'],
        ['HSBC MSCI EM Islamic screened', 'HIEM.SW', 'SIX · USD'],
        ['HSBC MSCI Europe Islamic screened', 'HIPS.PA', 'Euronext Paris · EUR']],
      'The Paris line is quoted in euros and the Swiss ones in dollars, so read the price column '
        + 'per row rather than down it.'),
      g('Listed in the Gulf and India', [
        ['Albilad Saudi sovereign sukuk', '9403.SR', 'Saudi Exchange · SAR'],
        ['Alinma Saudi government sukuk', '9404.SR', 'Saudi Exchange · SAR'],
        ['Nippon India Nifty 50 Shariah BeES', 'SHARIABEES.NS', 'NSE · INR']],
      'Quoted in riyals and rupees. The return columns are in the local currency too, so they '
        + 'carry no exchange-rate move — which is what makes them look calm beside the '
        + 'dollar-quoted rows above and is not a property of the funds.'),
    ],
  },

  {
    id: 'global',
    title: 'Global & regional',
    short: 'Global',
    blurb: 'Everything wider than one country: the whole world, the developed-versus-emerging '
      + 'split, and the regions in between.',
    groups: [
      g('World', [['World index', 'ACWI'], ['World ex-US', 'SPDW'], ['Global 100', 'IOO'],
        ['Global 50', 'DGT'], ['International mid caps', 'DIM'],
        ['International small caps', 'GWX']]),
      g('Developed and emerging', [['Developed markets', 'VEA'],
        ['Developed market value', 'EFV'], ['Developed small caps', 'SCZ'],
        ['Emerging markets', 'VWO'], ['Emerging markets small caps', 'EWX']]),
      g('Regions', [['Europe', 'VGK'], ['Europe large caps', 'SPEU'],
        ['European monetary union', 'EZU'], ['Euro zone large caps', 'FEZ'], ['Asia', 'AIA'],
        ['Emerging Asia-Pacific', 'GMF'], ['Pacific ex-Japan', 'EPP'], ['ASEAN', 'ASEA'],
        ['Latin America', 'ILF'], ['Africa', 'AFK'],
        ['Brazil, Russia, India, China', 'BKF']]),
    ],
  },

  {
    id: 'emerging',
    title: 'Emerging markets',
    short: 'Emerging',
    blurb: 'The emerging complex on its own: the regional baskets, one fund per country, the '
      + 'themes inside them, and the income versions.',
    groups: [
      g('Regions', [['Emerging markets', 'IEMG'], ['Emerging markets ex-China', 'EMXC'],
        ['Emerging Asia-Pacific', 'GMF'], ['Emerging markets small caps', 'EWX'],
        ['Brazil, Russia, India, China', 'BKF'], ['Latin America', 'ILF'], ['Africa', 'AFK'],
        ['ASEAN', 'ASEA']]),
      g('Countries', [['Brazil', 'EWZ'], ['Chile', 'ECH'], ['China', 'GXC'],
        ['China A-shares', 'ASHR'], ['Colombia', 'COLO'], ['Hong Kong', 'EWH'],
        ['India', 'INDA'], ['Indonesia', 'IDX'], ['Malaysia', 'EWM'], ['Mexico', 'EWW'],
        ['Peru', 'EPU'], ['South Africa', 'EZA'], ['South Korea', 'EWY'], ['Taiwan', 'EWT'],
        ['Thailand', 'THD'], ['Turkey', 'TUR'], ['Vietnam', 'VNM'], ['Argentina', 'ARGT'],
        ['Qatar', 'QAT'], ['United Arab Emirates', 'UAE'], ['Greece', 'GREK']]),
      g('Themes', [['Emerging market technology', 'EMQQ'], ['China internet', 'KWEB'],
        ['China technology', 'CQQQ'], ['China consumer', 'CHIQ'], ['China healthcare', 'KURE'],
        ['Emerging consumer', 'ECON'], ['Emerging infrastructure', 'EMIF'],
        ['India consumer', 'INCO']]),
      g('Dividends and small caps', [['Emerging market dividends', 'DEM'],
        ['Emerging small-cap dividends', 'DGS'], ['Quality dividend growth', 'DGRE'],
        ['China small cap', 'ECNS'], ['Brazil small cap', 'EWZS'],
        ['India small cap', 'SMIN']]),
    ],
  },

  {
    id: 'countries',
    title: 'Country funds',
    short: 'Countries',
    blurb: 'One fund per market, grouped by region. The closest thing to a world index board '
      + 'that can actually be held — an index is a measurement, a country fund is a position.',
    note: 'Returns are in US dollars, because the fund is US-listed. A market up in its own '
      + 'currency and down here is the exchange rate, not the market.',
    groups: [
      g('Americas', [['United States', 'EUSA'], ['Canada', 'EWC'], ['Mexico', 'EWW'],
        ['Brazil', 'EWZ'], ['Chile', 'ECH'], ['Colombia', 'COLO'], ['Peru', 'EPU'],
        ['Argentina', 'ARGT']]),
      g('Europe', [['United Kingdom', 'EWU'], ['Germany', 'EWG'], ['France', 'EWQ'],
        ['Netherlands', 'EWN'], ['Switzerland', 'EWL'], ['Spain', 'EWP'], ['Italy', 'EWI'],
        ['Sweden', 'EWD'], ['Denmark', 'EDEN'], ['Finland', 'EFNL'], ['Norway', 'NORW'],
        ['Austria', 'EWO'], ['Belgium', 'EWK'], ['Ireland', 'EIRL'], ['Poland', 'EPOL'],
        ['Greece', 'GREK'], ['Turkey', 'TUR']]),
      g('Asia-Pacific', [['Japan', 'EWJ'], ['China', 'GXC'], ['Hong Kong', 'EWH'],
        ['Taiwan', 'EWT'], ['South Korea', 'EWY'], ['India', 'INDA'], ['Indonesia', 'IDX'],
        ['Malaysia', 'EWM'], ['Singapore', 'EWS'], ['Thailand', 'THD'], ['Vietnam', 'VNM'],
        ['Philippines', 'EPHE'], ['Australia', 'EWA'], ['New Zealand', 'ENZL']]),
      g('Middle East and Africa', [['Israel', 'EIS'], ['Saudi Arabia', 'KSA'], ['Qatar', 'QAT'],
        ['United Arab Emirates', 'UAE'], ['Kuwait', 'KWT'], ['South Africa', 'EZA']]),
    ],
  },

  {
    id: 'bonds',
    title: 'Bond funds',
    short: 'Bonds',
    blurb: 'Fixed income by issuer and by maturity. A bond fund’s price is the inverse of the '
      + 'yield move behind it, which is why the return columns here read the opposite way to '
      + 'the equity boards.',
    note: 'The Treasury curve itself — every tenor from one month to thirty years — is on '
      + 'Market Data → Economy. This board is the funds that hold it.',
    groups: [
      g('Broad bond indexes', [['US aggregate', 'BND'], ['Government & credit', 'AGGM'],
        ['Long-term bonds', 'SPLB'], ['Intermediate bonds', 'SPIB'],
        ['Short-term bonds', 'BSV']]),
      g('US government', [['20+ year Treasuries', 'TLT'], ['7-10 year Treasuries', 'IEF'],
        ['1-3 year Treasuries', 'SHY'], ['1-30 year Treasuries', 'GOVI'],
        ['Treasury bills', 'BIL'], ['TIPS', 'TIP']]),
      g('Corporate', [['Investment grade, broad', 'LQD'],
        ['Investment grade, long-term', 'IGLB'], ['Investment grade, medium-term', 'IGIB'],
        ['Investment grade, short-term', 'IGSB'], ['High yield', 'HYG'],
        ['High yield, alternative index', 'JNK']]),
      g('International', [['International government', 'BWX'],
        ['Short-term international government', 'BWZ'],
        ['Inflation-protected international government', 'WIP'],
        ['International corporate', 'PICB'], ['Emerging market government', 'PCY']]),
      g('Municipal', [['National munis', 'TFI'], ['National munis, intermediate', 'ITM'],
        ['National munis, long-term', 'MLN'], ['National munis, short-term', 'SHM'],
        ['High-yield munis', 'HYD'], ['California munis', 'CMF'], ['New York munis', 'NYF']]),
      g('Other fixed income', [['Convertible bonds', 'CWB'], ['Mortgage bonds', 'SPMB'],
        ['Senior loans', 'BKLN']]),
    ],
  },

  {
    id: 'commodities',
    title: 'Commodities',
    short: 'Commodities',
    blurb: 'Metals, energy, agriculture and the diversified baskets.',
    note: 'Most of these hold futures rather than the physical good. The cost of rolling one '
      + 'contract into the next is the gap between the fund and the headline spot price, and '
      + 'over a year it can be most of the return.',
    groups: [
      g('Precious metals', [['Gold', 'GLD'], ['Silver', 'SLV'], ['Platinum', 'PPLT'],
        ['Palladium', 'PALL']]),
      g('Energy', [['Oil (WTI)', 'USO'], ['Oil (Brent)', 'BNO'], ['Natural gas', 'UNG'],
        ['Gasoline', 'UGA']]),
      g('Agriculture', [['Corn', 'CORN'], ['Soybeans', 'SOYB'], ['Wheat', 'WEAT'],
        ['Sugar', 'CANE']]),
      g('Industrial', [['Copper', 'CPER'], ['Steel', 'SLX'], ['Nickel', 'NIKL'],
        ['Rare earth & strategic metals', 'REMX']]),
      g('Baskets', [['Diversified — Bloomberg index', 'BCI'],
        ['Diversified — Goldman Sachs index', 'GSG'], ['Industrial metals', 'DBB'],
        ['Agriculture', 'DBA'], ['Energy', 'DBE']]),
    ],
  },

  {
    id: 'real-estate',
    title: 'Real estate',
    short: 'Real estate',
    blurb: 'Property as a listed asset: the broad REIT funds, the sector slices inside them, '
      + 'and the housing strategies beside them.',
    groups: [
      g('Broad REITs', [['United States', 'VNQ'], ['World', 'RWO'], ['World ex-US', 'VNQI'],
        ['Developed ex-US', 'IFGL'], ['US real estate sector', 'XLRE']]),
      g('US sector REITs', [['Industrial', 'INDS'], ['Residential', 'REZ'],
        ['Mortgage', 'REM'], ['Net lease', 'NETL'], ['Short-term leases', 'NURE']],
      'A mortgage REIT lends against property rather than owning it, so it moves with rates '
        + 'more than with rents. It sits in this group because the index does, not because it '
        + 'behaves like the rows above it.'),
      g('Housing strategies', [['Homebuilders', 'XHB'], ['Home construction', 'ITB'],
        ['Total US housing market', 'HOMZ']]),
    ],
  },

  {
    id: 'currencies',
    title: 'Currency funds',
    short: 'Currencies',
    blurb: 'The dollar and its counterparties, held as funds.',
    note: 'Spot exchange rates and the full currency list are quoted on the Markets hub. A '
      + 'currency fund carries the interest-rate differential as well as the exchange rate, so '
      + 'it does not track a spot quote exactly.',
    groups: [
      g('The dollar', [['Dollar bullish', 'UUP'], ['Dollar bearish', 'UDN'],
        ['Bloomberg dollar bullish', 'USDU']]),
      g('Single currencies', [['Euro', 'FXE'], ['British pound', 'FXB'],
        ['Japanese yen', 'FXY'], ['Swiss franc', 'FXF'], ['Canadian dollar', 'FXC'],
        ['Australian dollar', 'FXA'], ['Emerging market basket', 'CEW']]),
      g('Leveraged currency', [['Euro — 2x long', 'ULE'], ['Euro — 2x short', 'EUO'],
        ['Yen — 2x long', 'YCL'], ['Yen — 2x short', 'YCS']],
      'Daily-reset leverage. Held longer than a day these compound away from the multiple they '
        + 'name, and the three-year column is usually where that shows.'),
    ],
  },

  {
    id: 'crypto',
    title: 'Crypto funds',
    short: 'Crypto',
    blurb: 'The listed wrappers: spot bitcoin and ether trusts, the futures-based strategies, '
      + 'and the equities that earn from the industry.',
    note: 'Coins themselves are quoted on the Markets hub. A spot trust tracks one at a '
      + 'management fee; it is not the coin, and the fee is the difference over a year.',
    groups: [
      g('Spot bitcoin', [['iShares Bitcoin Trust', 'IBIT'], ['Fidelity Wise Origin', 'FBTC'],
        ['Grayscale Bitcoin Trust', 'GBTC'], ['Grayscale Bitcoin Mini', 'BTC'],
        ['Bitwise Bitcoin', 'BITB'], ['ARK 21Shares Bitcoin', 'ARKB'],
        ['VanEck Bitcoin', 'HODL']],
      'These launched in January 2024, so the three-year column is empty for most of them by '
        + 'construction rather than by a gap in the feed.'),
      g('Spot ether', [['iShares Ethereum Trust', 'ETHA'], ['Fidelity Ethereum', 'FETH'],
        ['Grayscale Ethereum Trust', 'ETHE'], ['Grayscale Ethereum Mini', 'ETH'],
        ['Bitwise Ethereum', 'ETHW'], ['VanEck Ethereum', 'ETHV']]),
      g('Futures and strategy', [['Bitcoin strategy', 'BITO'], ['Ether strategy', 'EETH'],
        ['Bitcoin 2x strategy', 'BITX']],
      'Futures-based rather than spot. The roll is a cost the spot trusts above do not pay.'),
      g('Crypto equities', [['Blockchain — transformational data', 'BLOK'],
        ['Crypto industry innovators', 'BITQ'], ['Digital transformation', 'DAPP'],
        ['Bitcoin miners', 'WGMI']],
      'Companies, not coins. Their holdings are graded like any other equity elsewhere in this '
        + 'product; the fund that holds them is not.'),
    ],
  },
];

export const etfTableCategory = (id) =>
  ETF_TABLE_CATEGORIES.find((category) => category.id === id) || ETF_TABLE_CATEGORIES[0];

/**
 * Every `[label, symbol]` in the catalogue, flattened once at load.
 *
 * This is what the search box reads. A fund appears once per place it is
 * filed — GLD is on the key-markets board and on the commodities board — and
 * a search that collapsed those would hide the second answer to "where else
 * does this live", which is most of what a reader is asking.
 */
export const ETF_TABLE_INDEX = ETF_TABLE_CATEGORIES.flatMap((category) =>
  category.groups.flatMap((group) => group.funds.map(([label, symbol, hint]) => ({
    symbol, label, hint: hint || null,
    group: group.title, category: category.title, categoryId: category.id,
  }))));

/** Distinct symbols across one category's groups, first appearance first. */
export const categorySymbols = (category) =>
  [...new Set(category.groups.flatMap((group) => group.funds.map(([, symbol]) => symbol)))];

/** How many funds the whole catalogue names, counted once each. */
export const CATALOGUE_SIZE = new Set(ETF_TABLE_INDEX.map((row) => row.symbol)).size;

/* ==========================================================================
   Loading a board
   ========================================================================== */

const CHUNK = 50;
const number = (row, key) => {
  if (!row) return null;
  const value = typeof row[key] === 'string' ? Number(row[key]) : row[key];
  return isNum(value) ? value : null;
};

/**
 * Price, session and the five return windows for a symbol list.
 *
 * Returns a `Map` keyed on the upper-cased symbol. A symbol either feed did
 * not return is simply absent, and the table prints a dash in its place — a
 * fund that has closed is a gap in the board, not an error on the page.
 */
export async function loadFundRows(symbols) {
  const list = [...new Set((symbols || []).filter(Boolean).map((s) => String(s).toUpperCase()))];
  if (!list.length) return { rows: new Map(), status: 'ok', message: '' };
  if (!hasApiKey()) {
    return { rows: new Map(), status: 'skipped', message: 'Connect your FMP API key in Settings to quote these funds.' };
  }

  const chunks = [];
  for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK));

  const [quotes, changes] = await Promise.all([
    fetchBatchQuotes(list),
    Promise.all(chunks.map((chunk) => fetchHubFeed('priceChanges', { symbol: chunk.join(',') }))),
  ]);

  const windows = new Map();
  for (const result of changes) {
    if (result.status !== 'ok') continue;
    for (const row of result.data || []) {
      if (row?.symbol) windows.set(String(row.symbol).toUpperCase(), row);
    }
  }

  const rows = new Map();
  for (const quote of (quotes.status === 'ok' ? quotes.data || [] : [])) {
    if (!quote?.symbol) continue;
    const symbol = String(quote.symbol).toUpperCase();
    const window = windows.get(symbol) || null;
    rows.set(symbol, {
      symbol,
      fundName: quote.name || '',
      kind: 'etf',
      price: number(quote, 'price'),
      volume: number(quote, 'volume'),
      /* The session comes from the quote rather than the window feed's `1D`:
         the two agree at the close and only the quote moves during the day. */
      d1: number(quote, 'changePercentage') ?? number(quote, 'changesPercentage') ?? number(window, '1D'),
      d5: number(window, '5D'),
      m1: number(window, '1M'),
      m3: number(window, '3M'),
      ytd: number(window, 'ytd'),
      y1: number(window, '1Y'),
      y3: number(window, '3Y'),
      dayLow: number(quote, 'dayLow'),
      dayHigh: number(quote, 'dayHigh'),
      yearLow: number(quote, 'yearLow'),
      yearHigh: number(quote, 'yearHigh'),
    });
  }

  if (quotes.status !== 'ok') {
    return { rows, status: quotes.status, message: quotes.message || '' };
  }
  return { rows, status: 'ok', message: '' };
}
