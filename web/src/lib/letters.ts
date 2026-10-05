/* ==========================================================================
   Maz Vantage — Letters & Outlooks

   What the large houses and the best-known funds tell their own clients:
   annual and quarterly outlooks, letters to fund investors, standing memo
   series, chart books, and the official forecasters. Fiscal.ai's Fund
   Letters and S&P's research collection are the shape; this is a curated
   index, not a copy.

   ---------------------------------------------------------------------------
   Three rules the page depends on
   ---------------------------------------------------------------------------

   1. **We link, we never host.** Every entry points at the publisher's own
      page or file. The documents are the firms' copyright, several say "not
      for distribution", and a library that re-served them would be the one
      thing here a firm could take down. The `about` line is ours, written
      from reading the document, and is far shorter than any of them.

   2. **Nothing is entered that was not checked.** Each entry's title, date
      and address were read off the publisher's own site on 2026-10-05
      (`CHECKED`). Where a document gives only a month, `date` is `YYYY-MM`
      and the page prints the month — a day would be invented. Where the
      publisher reuses one address for every edition, `rolling` says so, and
      the link is labelled as the current edition rather than this one.

   3. **The companies are what the letter says, not what we infer.**
      `mentions` lists positions a fund says it opened or closed, and the
      holdings it discusses by name. An entry with no `mentions` discusses
      no positions — or names only private or unlisted ones — rather than
      not having been read. A company with no US listing keeps its name and
      gets no ticker, so it never links to a report that cannot load.

   Like the research feed, the visible filters are flat and the model is not:
   a firm's type and its 13F filer number live on the firm, never on the
   letter, so two letters from one house cannot disagree about who wrote
   them. The query is the URL and there is no second copy of it.

   Two tiers, one model:
   - **Curated** (`CURATED_LETTERS`, below): read in full, with our own
     `about` line and, for fund letters, the companies named.
   - **Indexed** (`INDEX_LETTERS`, `letters-index.ts`): found on each firm's
     own letters or insights page and opened on the check date, so the
     title, date and link are the publisher's — but nobody has read it in
     full, so it has no `about`. Its `mentions` are either what the title
     names, or — for a fund letter — the trade list read out of the letter
     itself ("we purchased…", "we sold…").
   The firm list is ours, built from the publishers' own sites. It is not
   copied from any aggregator: Fiscal.ai's index is its product, and its site
   blocks automated reading.

   A licensed feed (Fiscal.ai's letters, S&P's aftermarket research) would
   replace `LETTERS` with a loader; every function below takes the list as
   an argument for that reason.
   ========================================================================== */

import { INDEX_FIRMS, INDEX_LETTERS } from './letters-index';

/** The day every entry was last checked against its publisher. */
export const CHECKED = '2026-10-05';

/* ==========================================================================
   1. Vocabulary
   ========================================================================== */

export type LetterKind = 'outlook' | 'letter' | 'memo' | 'research' | 'chartbook' | 'economic';

export const KINDS: { key: LetterKind; label: string; one: string; blurb: string }[] = [
  { key: 'outlook', label: 'Outlooks', one: 'Outlook',
    blurb: 'A house’s view of the year or the quarter ahead, across asset classes.' },
  { key: 'letter', label: 'Fund letters', one: 'Fund letter',
    blurb: 'A manager writing to its own investors: how the fund did, what it bought and sold, and why.' },
  { key: 'memo', label: 'Memos & commentary', one: 'Commentary',
    blurb: 'An author or a desk arguing one idea, on no fixed calendar: memos, missives, articles.' },
  { key: 'research', label: 'Research reports', one: 'Research',
    blurb: 'Longer studies and white papers — a sector, an asset class, a single company.' },
  { key: 'chartbook', label: 'Chart books', one: 'Chart book',
    blurb: 'The data behind the views, as pages of charts, refreshed on a schedule.' },
  { key: 'economic', label: 'Economic outlooks', one: 'Economic outlook',
    blurb: 'Forecasts and surveys from official institutions, which have no fund to sell.' },
];

export type FirmType = 'asset-manager' | 'hedge-fund' | 'bank' | 'holding-company' | 'independent' | 'official';

export const FIRM_TYPES: { key: FirmType; label: string; one: string }[] = [
  { key: 'asset-manager', label: 'Asset managers', one: 'Asset manager' },
  { key: 'hedge-fund', label: 'Hedge funds & partnerships', one: 'Hedge fund or partnership' },
  { key: 'bank', label: 'Banks & brokers', one: 'Bank or broker' },
  { key: 'holding-company', label: 'Holding companies', one: 'Holding company' },
  { key: 'independent', label: 'Independent research', one: 'Independent research' },
  { key: 'official', label: 'Official institutions', one: 'Official institution' },
];

export type Topic =
  | 'macro' | 'rates' | 'inflation' | 'equities' | 'credit' | 'ai' | 'energy' | 'geopolitics' | 'policy' | 'fiscal';

export const TOPICS: { key: Topic; label: string }[] = [
  { key: 'macro', label: 'Economy & growth' },
  { key: 'rates', label: 'Rates & bonds' },
  { key: 'inflation', label: 'Inflation' },
  { key: 'equities', label: 'Equities' },
  { key: 'credit', label: 'Credit & private markets' },
  { key: 'ai', label: 'AI' },
  { key: 'energy', label: 'Energy & power' },
  { key: 'geopolitics', label: 'Geopolitics & trade' },
  { key: 'policy', label: 'Policy & regulation' },
  { key: 'fiscal', label: 'Deficits & debt' },
];

export type Region = 'global' | 'us' | 'europe' | 'asia' | 'em';

export const REGIONS: { key: Region; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'us', label: 'United States' },
  { key: 'europe', label: 'Europe' },
  { key: 'asia', label: 'Asia' },
  { key: 'em', label: 'Emerging markets' },
];

/** The three ways in, after Fiscal.ai's Letters / Stocks / Investors. */
export const TABS = [
  { key: 'documents', label: 'Documents' },
  { key: 'investors', label: 'Investors' },
  { key: 'companies', label: 'Companies' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

export const SORTS = [
  { key: 'latest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'firm', label: 'Firm A–Z' },
] as const;

export type SortKey = (typeof SORTS)[number]['key'];

/* ==========================================================================
   2. Firms
   ========================================================================== */

export interface Firm {
  key: string;
  name: string;
  type: FirmType;
  /** The listed parent, for its logo and a link to its report. Absent when there is none in the US. */
  ticker?: string;
  /** The logo image is a light mark on transparent, so it needs a dark tile to be seen. */
  logoOnDark?: boolean;
  /** The publisher's own index of the series — where the next edition will appear. */
  home: string;
  homeLabel: string;
  /** The SEC filer number, when the firm is on the Superinvestors list. */
  cik?: string;
}

const CURATED_FIRMS: Firm[] = [
  { key: 'blackrock', name: 'BlackRock Investment Institute', type: 'asset-manager', ticker: 'BLK', logoOnDark: true,
    home: 'https://www.blackrock.com/corporate/insights/blackrock-investment-institute', homeLabel: 'Outlook and weekly commentary' },
  { key: 'jpm-am', name: 'J.P. Morgan Asset Management', type: 'bank', ticker: 'JPM',
    home: 'https://am.jpmorgan.com/us/en/asset-management/adv/insights/market-insights/guide-to-the-markets/', homeLabel: 'Guide to the Markets' },
  { key: 'pimco', name: 'PIMCO', type: 'asset-manager',
    home: 'https://www.pimco.com/us/en/insights', homeLabel: 'Cyclical and secular outlooks' },
  { key: 'apollo', name: 'Apollo Global Management', type: 'asset-manager', ticker: 'APO',
    home: 'https://www.apolloacademy.com/the-daily-spark/', homeLabel: 'Torsten Slok’s Daily Spark' },
  { key: 'gmo', name: 'GMO', type: 'asset-manager',
    home: 'https://www.gmo.com/americas/research-library/', homeLabel: 'Research library' },
  { key: 'oaktree', name: 'Oaktree Capital Management', type: 'asset-manager', cik: '0000949509',
    home: 'https://www.oaktreecapital.com/insights/memos', homeLabel: 'Howard Marks memos' },
  { key: 'oakmark', name: 'Oakmark Funds', type: 'asset-manager',
    home: 'https://oakmark.com/news-insights/', homeLabel: 'Quarterly commentary' },
  { key: 'fundsmith', name: 'Fundsmith', type: 'asset-manager', cik: '0001569205',
    home: 'https://www.fundsmith.co.uk/documents/', homeLabel: 'Letters to shareholders' },
  { key: 'bridgewater', name: 'Bridgewater Associates', type: 'hedge-fund', cik: '0001350694',
    home: 'https://www.bridgewater.com/research-and-insights', homeLabel: 'Research & insights' },
  { key: 'pershing', name: 'Pershing Square', type: 'hedge-fund', cik: '0001336528',
    home: 'https://pershingsquareholdings.com/performance/reports-and-statements/', homeLabel: 'Reports and statements' },
  { key: 'berkshire', name: 'Berkshire Hathaway', type: 'holding-company', ticker: 'BRK-B', cik: '0001067983',
    home: 'https://www.berkshirehathaway.com/letters/letters.html', homeLabel: 'Shareholder letters' },
  { key: 'imf', name: 'International Monetary Fund', type: 'official',
    home: 'https://www.imf.org/en/Publications/WEO', homeLabel: 'World Economic Outlook' },
  { key: 'oecd', name: 'OECD', type: 'official',
    home: 'https://www.oecd.org/en/topics/economic-outlook.html', homeLabel: 'Economic Outlook' },
  { key: 'fed', name: 'Federal Reserve Board', type: 'official',
    home: 'https://www.federalreserve.gov/monetarypolicy/publications/beige-book-default.htm', homeLabel: 'Beige Book' },
];

/** Curated firms first, then the indexed ones; the shelf keeps this order. */
export const FIRMS: Firm[] = [...CURATED_FIRMS, ...INDEX_FIRMS];

export const FIRM_BY_KEY: Record<string, Firm> = Object.fromEntries(FIRMS.map((f) => [f.key, f]));

/* ==========================================================================
   3. The letters
   ========================================================================== */

export type MentionAction = 'bought' | 'sold' | 'discussed';

export interface Mention {
  name: string;
  /** US listing only; a company without one is named and not linked. */
  ticker?: string;
  action: MentionAction;
}

export interface Letter {
  /** Stable, and never reused: it is the `?letter=` an outside link would carry. */
  id: string;
  firm: string;
  kind: LetterKind;
  title: string;
  authors?: string[];
  /** `YYYY-MM-DD`, or `YYYY-MM` when the document gives only a month. */
  date: string;
  /** What it covers, when that is not simply the date: "2Q 2026", "H1 2026", "2025". */
  period?: string;
  /** The publisher's page, or its file when there is no page. */
  url: string;
  format: 'pdf' | 'web';
  /** A PDF beside the page, when the publisher offers both. */
  pdf?: string;
  pages?: number;
  /** Found by the crawler on the firm's own site: kind, topics and regions were assigned from the title. */
  auto?: boolean;
  /** The publisher reuses this address for every edition. */
  rolling?: boolean;
  /** Ours: one or two sentences on what the document argues, read from it. Curated entries only. */
  about?: string;
  topics: Topic[];
  regions: Region[];
  mentions?: Mention[];
}

const m = (action: MentionAction) => (name: string, ticker?: string): Mention => (ticker ? { name, ticker, action } : { name, action });
const bought = m('bought');
const sold = m('sold');
const discussed = m('discussed');

const CURATED_LETTERS: Letter[] = [
  /* ---------- fund letters -------------------------------------------------- */
  {
    id: 'pershing-2026-interim',
    firm: 'pershing',
    kind: 'letter',
    title: 'Pershing Square Holdings — 2026 Interim Report',
    date: '2026-08-13',
    period: 'H1 2026',
    url: 'https://assets.pershingsquareholdings.com/wp-content/uploads/2026/08/13002306/Pershing-Square-Holdings-Ltd.-June-2026-Interim.pdf',
    format: 'pdf',
    pages: 59,
    about: 'The chairman’s statement and the manager’s portfolio update: NAV down 12.6% in the first half against a 10.2% rise in the S&P 500, '
      + 'the discount to NAV widened to 34%, and new positions in payments, streaming, market data and exchanges.',
    topics: ['equities'],
    regions: ['us'],
    mentions: [
      bought('Visa', 'V'), bought('Mastercard', 'MA'), bought('Netflix', 'NFLX'), bought('S&P Global', 'SPGI'),
      bought('Alcon', 'ALC'), bought('Intercontinental Exchange', 'ICE'),
      sold('Alphabet', 'GOOGL'), sold('Hertz Global', 'HTZ'), sold('Universal Music Group'),
      discussed('Microsoft', 'MSFT'), discussed('Amazon', 'AMZN'), discussed('Restaurant Brands International', 'QSR'),
      discussed('Howard Hughes Holdings', 'HHH'), discussed('Fannie Mae'), discussed('Freddie Mac'),
    ],
  },
  {
    id: 'fundsmith-2026-h1',
    firm: 'fundsmith',
    kind: 'letter',
    title: 'Fundsmith Equity Fund — 2026 Semi-Annual Letter to Shareholders',
    authors: ['Terry Smith'],
    date: '2026-07',
    period: 'H1 2026',
    url: 'https://www.fundsmith.co.uk/media/lfhpxi1x/2026-fef-semi-annual-letter-to-shareholders-web.pdf',
    format: 'pdf',
    about: 'A first half in which the fund fell 2.9% while the MSCI World rose 11.2%, turnover of 51%, and a change of method: more weight '
      + 'on momentum, and far less willingness to buy good companies after a setback.',
    topics: ['equities', 'ai'],
    regions: ['global'],
    mentions: [
      bought('AppLovin', 'APP'), bought('GE Vernova', 'GEV'), bought('Legrand'), bought('Mastercard', 'MA'), bought('Netflix', 'NFLX'),
      bought('Nextpower'), bought('Sage Group'), bought('TJX Companies', 'TJX'), bought('TSMC', 'TSM'), bought('Uber', 'UBER'),
      bought('Veeva Systems', 'VEEV'), bought('Yum! Brands', 'YUM'),
      sold('Atlas Copco'), sold('Coloplast'), sold('EssilorLuxottica'), sold('Intuit', 'INTU'), sold('LVMH'), sold('Magnum Ice Cream'),
      sold('Mettler-Toledo', 'MTD'), sold('Nike', 'NKE'), sold('Novo Nordisk', 'NVO'), sold('Otis', 'OTIS'), sold('Unilever', 'UL'),
      sold('Wolters Kluwer'), sold('Zoetis', 'ZTS'),
    ],
  },
  {
    id: 'oakmark-2q26-us-equity',
    firm: 'oakmark',
    kind: 'letter',
    title: 'The discipline to stay boring — U.S. equity market commentary, 2Q 2026',
    authors: ['Bill Nygren'],
    date: '2026-06-30',
    period: '2Q 2026',
    url: 'https://oakmark.com/news-insights/the-discipline-to-stay-boring-u-s-equity-market-commentary-2q-2026/',
    format: 'web',
    about: 'The Oakmark Fund was flat for the year at midyear and behind the index, because it owns little of the richly valued technology '
      + 'driving the market; the case for holding to the value discipline anyway.',
    topics: ['equities'],
    regions: ['us'],
  },
  {
    id: 'berkshire-2025',
    firm: 'berkshire',
    kind: 'letter',
    title: 'Berkshire Hathaway — 2025 Letter to Shareholders',
    authors: ['Greg Abel'],
    date: '2026-02-28',
    period: '2025',
    url: 'https://www.berkshirehathaway.com/letters/2025ltr.pdf',
    format: 'pdf',
    about: 'Greg Abel’s first annual letter as chief executive: the culture and stewardship he means to keep after Warren Buffett, the year '
      + 'in the operating and insurance businesses, and the succession of the chief financial officer.',
    topics: ['equities'],
    regions: ['us'],
  },

  /* ---------- memos & commentary -------------------------------------------- */
  {
    id: 'oaktree-repeal-laws-iii',
    firm: 'oaktree',
    kind: 'memo',
    title: 'Shall We Repeal the Laws of Economics – Part III',
    authors: ['Howard Marks'],
    date: '2026-09-22',
    url: 'https://www.oaktreecapital.com/insights/memo/shall-we-repeal-the-laws-of-economics---part-iii',
    pdf: 'https://www.oaktreecapital.com/docs/default-source/memos/shall-we-repeal-the-laws-of-economics-part-iii.pdf?sfvrsn=e7b72d66_1',
    format: 'web',
    about: 'With the 30-year Treasury yield above 5.3%, Marks argues that buying back long bonds to hold yields down treats the symptom: '
      + 'the cause is deficits from spending above revenue, and that needs a change in behaviour, not an intervention in the market.',
    topics: ['rates', 'fiscal', 'policy'],
    regions: ['us'],
  },
  {
    id: 'bridgewater-carbon-pricing',
    firm: 'bridgewater',
    kind: 'memo',
    title: 'Carbon Pricing’s Impact on Global Industry Is Quietly Growing',
    authors: ['Karen Karniol-Tambour', 'Jeremy Ng', 'Daniel Hochman'],
    date: '2026-09-21',
    url: 'https://www.bridgewater.com/research-and-insights/carbon-pricings-impact-on-global-industry-is-quietly-growing',
    format: 'web',
    about: 'Carbon prices in the EU and China now cover about 30% of global emissions, and the EU’s border adjustment is spreading them '
      + 'to its trading partners — a growing, measurable cost that is sorting energy-intensive industries into winners and losers.',
    topics: ['energy', 'policy', 'geopolitics'],
    regions: ['global', 'europe', 'asia'],
  },
  {
    id: 'bridgewater-ai-policy',
    firm: 'bridgewater',
    kind: 'memo',
    title: 'Our Thoughts on What Is Likely the Most Important Policy Decision of Our Lifetime',
    authors: ['Greg Jensen', 'Nir Bar Dea', 'Danny DeBois', 'Alexa Rozario'],
    date: '2026-08-04',
    url: 'https://www.bridgewater.com/research-and-insights/our-thoughts-on-what-is-likely-the-most-important-policy-decision-of-our-lifetime',
    format: 'web',
    about: 'The case for acting on AI now — a tax on machine output, broad public ownership of the leading AI companies, and enforced '
      + 'safety rules — on the view that without them AI ends in mass displacement of labour or an accident that halts it.',
    topics: ['ai', 'policy'],
    regions: ['global'],
  },
  {
    id: 'gmo-electricity-tipping-point',
    firm: 'gmo',
    kind: 'memo',
    title: 'The Electricity Tipping Point & the Next Energy Boom',
    authors: ['Lucas White'],
    date: '2026-07-23',
    url: 'https://www.gmo.com/americas/research-library/the-electricity-tipping-point--the-next-energy-boom_insights/',
    pdf: 'https://www.gmo.com/globalassets/articles/insights/focused-equity/2026/gmo_the-electricity-tipping-point--the-next-energy-boom_7-26.pdf',
    format: 'web',
    about: 'Demand for electricity is surging on AI data centres, electrification and growth; the piece maps the investment that follows '
      + 'across generation, grids, storage and the commodities they consume.',
    topics: ['energy', 'ai', 'equities'],
    regions: ['global'],
  },
  {
    id: 'oaktree-private-credit',
    firm: 'oaktree',
    kind: 'memo',
    title: 'What’s Going on in Private Credit?',
    authors: ['Howard Marks'],
    date: '2026-04-09',
    url: 'https://www.oaktreecapital.com/insights/memo/whats-going-on-in-private-credit',
    format: 'web',
    about: 'Sub-investment-grade lending from its start in the 1970s to the post-crisis rise of direct lending: why it grew so fast, the '
      + 'problems that fast deployment created, and how its fate is tied to private equity’s.',
    topics: ['credit'],
    regions: ['us'],
  },
  {
    id: 'oaktree-ai-hurtles-ahead',
    firm: 'oaktree',
    kind: 'memo',
    title: 'AI Hurtles Ahead',
    authors: ['Howard Marks'],
    date: '2026-02-26',
    url: 'https://www.oaktreecapital.com/insights/memo/ai-hurtles-ahead',
    format: 'web',
    about: 'What sets AI apart from earlier technologies — its power, speed and autonomy — and its limits; Marks is sure it is no fad, '
      + 'and treats that as a separate question from whether AI assets are sensibly priced.',
    topics: ['ai', 'equities'],
    regions: ['global'],
  },

  /* ---------- outlooks ------------------------------------------------------ */
  {
    id: 'blackrock-2026-q4-outlook',
    firm: 'blackrock',
    kind: 'outlook',
    title: 'Scarcity vs. abundance — Q4 update to the 2026 Global Outlook',
    date: '2026-09-15',
    period: 'Q4 2026',
    url: 'https://www.blackrock.com/corporate/insights/blackrock-investment-institute/outlook',
    pdf: 'https://www.blackrock.com/gls-download/literature/whitepaper/bii-global-outlook-in-charts.pdf',
    rolling: true,
    format: 'web',
    about: 'Government bond yields have broken higher as sovereign borrowing competes with AI-led private financing; the institute stays '
      + 'selective — the bottlenecks in the AI build-out, shorter-dated bonds, and infrastructure.',
    topics: ['rates', 'ai', 'equities', 'fiscal'],
    regions: ['global'],
  },
  {
    id: 'pimco-secular-2026',
    firm: 'pimco',
    kind: 'outlook',
    title: 'Rupture and Resilience — Secular Outlook',
    authors: ['Richard Clarida', 'Andrew Balls', 'Daniel J. Ivascyn'],
    date: '2026-06-10',
    url: 'https://www.pimco.com/us/en/insights/rupture-and-resilience',
    format: 'web',
    about: 'PIMCO’s longer-range view: geopolitical fragmentation and heavy AI investment are reshaping the world economy, and bond yields '
      + 'are now high enough to compete with equities without reaching for risk.',
    topics: ['macro', 'rates', 'geopolitics', 'ai'],
    regions: ['global'],
  },
  {
    id: 'pimco-cyclical-2026-03',
    firm: 'pimco',
    kind: 'outlook',
    title: 'Layered Uncertainty: Conflict, Credit Stress, and AI — Cyclical Outlook',
    authors: ['Tiffany Wilding', 'Andrew Balls'],
    date: '2026-03-24',
    url: 'https://www.pimco.com/us/en/insights/layered-uncertainty-conflict-credit-stress-and-ai',
    format: 'web',
    about: 'Conflict in the Middle East unsettles energy and the balance of growth and inflation while stress surfaces in private credit; '
      + 'the advice is liquid, high-quality bonds over illiquid alternatives, in portfolios built for several outcomes.',
    topics: ['credit', 'rates', 'geopolitics', 'energy'],
    regions: ['global'],
  },

  /* ---------- chart books --------------------------------------------------- */
  {
    id: 'jpm-gtm-us-4q26',
    firm: 'jpm-am',
    kind: 'chartbook',
    title: 'Guide to the Markets — U.S., 4Q 2026',
    authors: ['Dr. David Kelly', 'Global Market Insights Strategy team'],
    date: '2026-09-30',
    period: '4Q 2026',
    url: 'https://am.jpmorgan.com/content/dam/jpm-am-aem/global/en/insights/market-insights/guide-to-the-markets/mi-guide-to-the-markets-us.pdf',
    rolling: true,
    format: 'pdf',
    pages: 71,
    about: 'Seventy-one pages of charts on the economy, equities, fixed income, international markets and alternatives, with data as of '
      + '30 September 2026.',
    topics: ['macro', 'equities', 'rates', 'inflation'],
    regions: ['us', 'global'],
  },
  {
    id: 'apollo-outlook-2026-04',
    firm: 'apollo',
    kind: 'chartbook',
    title: 'Outlook for Public and Private Markets',
    authors: ['Torsten Slok'],
    date: '2026-04-05',
    url: 'https://www.apolloacademy.com/wp-content/uploads/2026/04/OutlookForPublicAndPrivateMarkets_040526.pdf',
    format: 'pdf',
    pages: 48,
    about: 'Apollo’s chief economist’s chart book on the economy, rates and public and private markets, opening on the effect of the '
      + 'conflict with Iran.',
    topics: ['macro', 'rates', 'credit', 'geopolitics'],
    regions: ['us', 'global'],
  },

  /* ---------- economic outlooks --------------------------------------------- */
  {
    id: 'oecd-interim-2026-09',
    firm: 'oecd',
    kind: 'economic',
    title: 'OECD Economic Outlook, Interim Report September 2026: Weathering Successive Shocks',
    date: '2026-09-23',
    url: 'https://www.oecd.org/en/publications/oecd-economic-outlook-interim-report-september-2026_f751d02b-en.html',
    format: 'web',
    about: 'Growth eased in the first half but held up better than expected: oil stocks, supply from outside the Gulf and government '
      + 'support contained the Middle East shock, and AI investment kept output and trade going. 2.9% projected for 2026, 3.0% for 2027.',
    topics: ['macro', 'inflation', 'energy'],
    regions: ['global'],
  },
  {
    id: 'fed-beige-book-2026-08',
    firm: 'fed',
    kind: 'economic',
    title: 'Beige Book — August 2026',
    date: '2026-09-02',
    url: 'https://www.federalreserve.gov/monetarypolicy/beigebook202608-summary.htm',
    format: 'web',
    about: 'Activity rose modestly since early July, with ten of twelve districts growing; manufacturing picked up on defence and '
      + 'data-centre orders, hiring barely moved, and input prices ran hot on energy, transport and metals.',
    topics: ['macro', 'inflation'],
    regions: ['us'],
  },
  {
    id: 'imf-weo-2026-07',
    firm: 'imf',
    kind: 'economic',
    title: 'World Economic Outlook Update, July 2026: Global Economy in Crosscurrents of War and Technology',
    date: '2026-07-08',
    url: 'https://www.imf.org/en/publications/weo/issues/2026/07/08/world-economic-outlook-update-july-2026',
    format: 'web',
    about: 'Global growth of 3.0% in 2026 and 3.4% in 2027, little changed since April but uneven: the war weighs on energy importers '
      + 'while AI demand lifts the economies in the technology supply chain.',
    topics: ['macro', 'ai', 'geopolitics', 'energy'],
    regions: ['global', 'em'],
  },
  {
    id: 'imf-weo-2026-04',
    firm: 'imf',
    kind: 'economic',
    title: 'World Economic Outlook, April 2026: Global Economy in the Shadow of War',
    date: '2026-04-14',
    url: 'https://www.imf.org/en/publications/weo/issues/2026/04/14/world-economic-outlook-april-2026',
    format: 'web',
    about: 'The full spring forecast round, built around the risk that war in the Middle East disrupts both growth and the fall in '
      + 'inflation.',
    topics: ['macro', 'inflation', 'geopolitics'],
    regions: ['global', 'em'],
  },
];

export const LETTERS: Letter[] = [...CURATED_LETTERS, ...INDEX_LETTERS];

export const LETTER_BY_ID: Record<string, Letter> = Object.fromEntries(LETTERS.map((l) => [l.id, l]));

/** Has someone read this one for us? */
export const isCurated = (l: Letter) => !!l.about;

/* ==========================================================================
   4. Reading a letter
   ========================================================================== */

export const firmOf = (l: Letter): Firm => FIRM_BY_KEY[l.firm];
export const kindLabel = (k: LetterKind) => KINDS.find((x) => x.key === k)?.one || k;
export const topicLabel = (t: string) => TOPICS.find((x) => x.key === t)?.label || t;
export const regionLabel = (r: string) => REGIONS.find((x) => x.key === r)?.label || r;
export const firmTypeLabel = (t: string) => FIRM_TYPES.find((x) => x.key === t)?.label || t;
export const firmTypeOne = (t: string) => FIRM_TYPES.find((x) => x.key === t)?.one || t;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "22 Sep 2026", or "July 2026" when only the month is known. Never a day that was not printed. */
export function dateLabel(date: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  if (!d) return `${MONTHS[mo - 1]} ${y}`;
  return `${d} ${MONTHS[mo - 1].slice(0, 3)} ${y}`;
}

/** The month a letter is filed under: "September 2026". */
export const monthLabel = (date: string) => dateLabel(date.slice(0, 7));

/** The publisher's host, for "Read at oaktreecapital.com". */
export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^(www|assets)\./, ''); } catch { return ''; }
}

/* ==========================================================================
   5. The query

   Seven keys, each a URL parameter of the same name. A value outside its
   vocabulary is dropped rather than honoured: a link with `?kind=letters`
   should show everything, not nothing.
   ========================================================================== */

export interface LetterQuery {
  /** Which table; documents when absent. Filters apply to all three. */
  tab?: Exclude<TabKey, 'documents'>;
  kind?: LetterKind;
  firm?: string;
  who?: FirmType;
  topic?: Topic;
  region?: Region;
  ticker?: string;
  q?: string;
  sort: SortKey;
}

const has = <T extends string>(list: { key: T }[], v: string | null): v is T => !!v && list.some((x) => x.key === v);

export function parseLetterQuery(search: string | URLSearchParams): LetterQuery {
  const p = new URLSearchParams(search);
  const out: LetterQuery = { sort: 'latest' };
  const tab = p.get('tab'); if (tab === 'investors' || tab === 'companies') out.tab = tab;
  const kind = p.get('kind'); if (has(KINDS, kind)) out.kind = kind;
  const firm = p.get('firm'); if (firm && FIRM_BY_KEY[firm]) out.firm = firm;
  const who = p.get('who'); if (has(FIRM_TYPES, who)) out.who = who;
  const topic = p.get('topic'); if (has(TOPICS, topic)) out.topic = topic;
  const region = p.get('region'); if (has(REGIONS, region)) out.region = region;
  const ticker = p.get('ticker')?.trim().toUpperCase(); if (ticker && /^[A-Z][A-Z.-]{0,9}$/.test(ticker)) out.ticker = ticker;
  const q = p.get('q')?.trim(); if (q) out.q = q.slice(0, 80);
  const sort = p.get('sort'); if (sort && SORTS.some((s) => s.key === sort)) out.sort = sort as SortKey;
  return out;
}

/** Apply a change; `null` or `''` removes a key. Sort survives every change. */
export function mergeLetterQuery(query: LetterQuery, change: Partial<Record<keyof LetterQuery, string | null>>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...query, ...change })) {
    if (v != null && v !== '') next[k] = String(v);
  }
  if (next.sort === 'latest') delete next.sort;
  return next;
}

/** The active filters, as removable chips. Kind is a pill row of its own and is not repeated here. */
export function activeLetterChips(query: LetterQuery): { key: keyof LetterQuery; label: string }[] {
  const chips: { key: keyof LetterQuery; label: string }[] = [];
  if (query.firm) chips.push({ key: 'firm', label: FIRM_BY_KEY[query.firm].name });
  if (query.who) chips.push({ key: 'who', label: firmTypeLabel(query.who) });
  if (query.topic) chips.push({ key: 'topic', label: topicLabel(query.topic) });
  if (query.region) chips.push({ key: 'region', label: regionLabel(query.region) });
  if (query.ticker) chips.push({ key: 'ticker', label: `Mentions ${query.ticker}` });
  if (query.q) chips.push({ key: 'q', label: `“${query.q}”` });
  return chips;
}

const haystack = (l: Letter) => [
  l.title, l.about, l.period, firmOf(l).name, ...(l.authors || []),
  ...(l.mentions || []).flatMap((x) => [x.name, x.ticker || '']),
].join(' ').toLowerCase();

export function queryLetters(query: LetterQuery, list: Letter[] = LETTERS): Letter[] {
  const words = (query.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const out = list.filter((l) => {
    const firm = firmOf(l);
    if (query.kind && l.kind !== query.kind) return false;
    if (query.firm && l.firm !== query.firm) return false;
    if (query.who && firm.type !== query.who) return false;
    if (query.topic && !l.topics.includes(query.topic)) return false;
    if (query.region && !l.regions.includes(query.region)) return false;
    if (query.ticker && !(l.mentions || []).some((x) => x.ticker === query.ticker)) return false;
    if (words.length) {
      const hay = haystack(l);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  // Ties fall back to the id, so the order never depends on the list's.
  const byDate = (a: Letter, b: Letter) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  if (query.sort === 'oldest') return out.sort((a, b) => -byDate(a, b));
  if (query.sort === 'firm') return out.sort((a, b) => firmOf(a).name.localeCompare(firmOf(b).name) || byDate(a, b));
  return out.sort(byDate);
}

/**
 * Consecutive runs, in the order given: by month for the date sorts, by firm
 * for the A–Z one. Runs rather than buckets, so a heading never appears twice.
 */
export function groupLetters(list: Letter[], sort: SortKey): { key: string; label: string; letters: Letter[] }[] {
  const keyOf = sort === 'firm' ? (l: Letter) => l.firm : (l: Letter) => l.date.slice(0, 7);
  const labelOf = sort === 'firm' ? (l: Letter) => firmOf(l).name : (l: Letter) => monthLabel(l.date);
  const groups: { key: string; label: string; letters: Letter[] }[] = [];
  for (const l of list) {
    const key = keyOf(l);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.letters.push(l);
    else groups.push({ key, label: labelOf(l), letters: [l] });
  }
  return groups;
}

/* ==========================================================================
   6. Across letters
   ========================================================================== */

/** Every letter that names this US ticker, newest first. */
export function lettersForTicker(ticker: string | null | undefined, list: Letter[] = LETTERS): Letter[] {
  const t = (ticker || '').toUpperCase();
  if (!t) return [];
  return queryLetters({ ticker: t, sort: 'latest' }, list);
}

export interface Overlap {
  ticker: string;
  name: string;
  action: 'bought' | 'sold';
  firms: string[];
  letters: Letter[];
}

/**
 * Companies that two or more **different firms** say they bought — or sold —
 * in the letters on file. Counted by firm, not by letter, so one manager
 * writing twice about the same purchase is not a consensus. Only listed
 * companies, because the point is somewhere to click through to.
 */
export function overlaps(list: Letter[] = LETTERS): Overlap[] {
  const map = new Map<string, Overlap>();
  for (const l of list) {
    for (const x of l.mentions || []) {
      if (!x.ticker || x.action === 'discussed') continue;
      const key = `${x.action}:${x.ticker}`;
      const row = map.get(key) || { ticker: x.ticker, name: x.name, action: x.action, firms: [], letters: [] };
      if (!row.firms.includes(l.firm)) row.firms.push(l.firm);
      if (!row.letters.includes(l)) row.letters.push(l);
      map.set(key, row);
    }
  }
  return [...map.values()]
    .filter((r) => r.firms.length >= 2)
    .sort((a, b) => b.firms.length - a.firms.length || a.action.localeCompare(b.action) || a.ticker.localeCompare(b.ticker));
}

/** Per firm: how many letters, and the newest. In `FIRMS` order. */
export function firmShelf(list: Letter[] = LETTERS): { firm: Firm; count: number; latest: Letter | null }[] {
  return FIRMS.map((firm) => {
    const own = list.filter((l) => l.firm === firm.key).sort((a, b) => b.date.localeCompare(a.date));
    return { firm, count: own.length, latest: own[0] || null };
  });
}

/* ==========================================================================
   7. Facets and the other two tables
   ========================================================================== */

type FacetKey = 'kind' | 'firm' | 'who' | 'topic' | 'region';

/**
 * How many documents each value of one filter would leave, with every
 * *other* filter applied — so a count never promises a page that is empty.
 */
export function facetCounts(query: LetterQuery, key: FacetKey, list: Letter[] = LETTERS): Record<string, number> {
  const rest = queryLetters({ ...query, [key]: undefined }, list);
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] || 0) + 1; };
  for (const l of rest) {
    if (key === 'kind') bump(l.kind);
    else if (key === 'firm') bump(l.firm);
    else if (key === 'who') bump(firmOf(l).type);
    else if (key === 'topic') l.topics.forEach(bump);
    else l.regions.forEach(bump);
  }
  return counts;
}

export interface InvestorRow {
  firm: Firm;
  count: number;
  kinds: LetterKind[];
  first: string;
  latest: Letter;
  /** Companies named across this firm's letters, listed ones only. */
  companies: number;
}

/** One row per firm with something in the filtered list; most documents first. */
export function investorRows(list: Letter[]): InvestorRow[] {
  const by = new Map<string, Letter[]>();
  for (const l of list) by.set(l.firm, [...(by.get(l.firm) || []), l]);
  return [...by.entries()].map(([key, own]) => {
    const sorted = [...own].sort((a, b) => b.date.localeCompare(a.date));
    const tickers = new Set(own.flatMap((l) => (l.mentions || []).map((x) => x.ticker).filter(Boolean)));
    return {
      firm: FIRM_BY_KEY[key],
      count: own.length,
      kinds: KINDS.map((k) => k.key).filter((k) => own.some((l) => l.kind === k)),
      first: sorted[sorted.length - 1].date,
      latest: sorted[0],
      companies: tickers.size,
    };
  }).sort((a, b) => b.count - a.count || b.latest.date.localeCompare(a.latest.date) || a.firm.name.localeCompare(b.firm.name));
}

export interface CompanyRow {
  ticker: string;
  name: string;
  letters: Letter[];
  firms: string[];
  bought: number;
  sold: number;
  discussed: number;
}

/**
 * One row per listed company the filtered letters name, counted by firm for
 * the actions — Fiscal.ai's Stocks table, at the size of what we have read.
 */
export function companyRows(list: Letter[]): CompanyRow[] {
  const map = new Map<string, CompanyRow & { by: Record<string, Set<string>> }>();
  for (const l of list) {
    for (const x of l.mentions || []) {
      if (!x.ticker) continue;
      const row = map.get(x.ticker) || { ticker: x.ticker, name: x.name, letters: [], firms: [], bought: 0, sold: 0, discussed: 0, by: { bought: new Set(), sold: new Set(), discussed: new Set() } };
      if (!row.letters.includes(l)) row.letters.push(l);
      if (!row.firms.includes(l.firm)) row.firms.push(l.firm);
      row.by[x.action].add(l.firm);
      map.set(x.ticker, row);
    }
  }
  return [...map.values()].map(({ by, ...row }) => ({ ...row, bought: by.bought.size, sold: by.sold.size, discussed: by.discussed.size }))
    .sort((a, b) => b.firms.length - a.firms.length || b.letters.length - a.letters.length || a.ticker.localeCompare(b.ticker));
}
