/* ==========================================================================
   Maz Vantage — the market around the company, from market researchers

   The trackers (IDC, TrendForce and the like) sell their full data, but
   publish headline tables in free press releases. This holds those headline
   figures, copied from the publisher's own release (never from coverage of
   it: one outlet's account of IDC's smartphone release put Apple at 46.4
   million units where IDC's table says 55.8 million), with the date, the
   link, and whether the publisher calls the data preliminary.

   Each market carries one paragraph of ours on what it means for the company
   and which debate it bears on. Pinned in tests/industry.test.ts: every row's
   shares add up, growth matches the units, and the debate exists.
   ========================================================================== */

export interface ShareRow { name: string; units: number; share: number; unitsYearAgo: number; shareYearAgo: number; growth: number }

export interface MarketRecord {
  symbol: string;
  id: string;
  market: string;
  period: string;
  publisher: string;
  title: string;
  date: string;
  url: string;
  preliminary: boolean;
  /** the unit the table counts in */
  unit: string;
  rows: ShareRow[];
  total: { units: number; unitsYearAgo: number; growth: number } | null;
  /** for a forecast with no vendor table: the published figures, as lines */
  figures?: { label: string; value: string }[];
  /** a later note from the same publisher that moves the figures */
  update?: { date: string; title: string; url: string; text: string };
  /** ours */
  reading: string;
  debate: string;
}

export const MARKETS: MarketRecord[] = [
  {
    symbol: 'AAPL', id: 'aapl-smartphones-2q26', market: 'Smartphones, worldwide', period: 'Q2 2026 (calendar)',
    publisher: 'IDC', title: 'Global Smartphone Shipments Fall 6.7% in Q2 2026 as the Memory Crisis Splits the Market in Two',
    date: '2026-07-13', url: 'https://www.idc.com/resource-center/press-releases/2q26-mpt-top5/', preliminary: true, unit: 'million units',
    rows: [
      { name: 'Samsung', units: 62.7, share: 0.226, unitsYearAgo: 58.0, shareYearAgo: 0.195, growth: 0.081 },
      { name: 'Apple', units: 55.8, share: 0.201, unitsYearAgo: 48.4, shareYearAgo: 0.163, growth: 0.153 },
      { name: 'Xiaomi', units: 31.2, share: 0.112, unitsYearAgo: 42.4, shareYearAgo: 0.142, growth: -0.263 },
      { name: 'OPPO', units: 28.8, share: 0.104, unitsYearAgo: 34.9, shareYearAgo: 0.117, growth: -0.175 },
      { name: 'vivo', units: 21.2, share: 0.076, unitsYearAgo: 26.3, shareYearAgo: 0.089, growth: -0.194 },
      { name: 'Others', units: 77.8, share: 0.28, unitsYearAgo: 87.4, shareYearAgo: 0.294, growth: -0.11 },
    ],
    total: { units: 277.5, unitsYearAgo: 297.4, growth: -0.067 },
    reading: 'Apple shipped 15% more phones in a market that shrank 7%, and its share rose by almost four points, while the vendors selling cheaper phones lost the most. Memory costs are pushing up the price of every phone; a buyer already paying a premium notices it least. This is the growth debate’s bull case in the market’s own figures, and the margin debate’s hope: that Apple can raise prices without losing units.',
    debate: 'aapl-growth',
  },
  {
    symbol: 'AAPL', id: 'aapl-pcs-3q26', market: 'PCs (desktops, notebooks, workstations), worldwide', period: 'Q3 2026 (calendar)',
    publisher: 'IDC', title: 'PC Market Woes Continue: Shipments Fall 20.1% in Q3 2026 as Pull-In Hangover and Supply Constraints Bite',
    date: '2026-10-08', url: 'https://www.idc.com/?p=121750', preliminary: true, unit: 'million units',
    rows: [
      { name: 'Lenovo', units: 14.9, share: 0.238, unitsYearAgo: 19.3, shareYearAgo: 0.246, growth: -0.226 },
      { name: 'HP Inc', units: 10.3, share: 0.165, unitsYearAgo: 15.0, shareYearAgo: 0.191, growth: -0.309 },
      { name: 'Dell Technologies', units: 7.6, share: 0.121, unitsYearAgo: 10.1, shareYearAgo: 0.129, growth: -0.25 },
      { name: 'Apple', units: 5.9, share: 0.095, unitsYearAgo: 6.7, shareYearAgo: 0.085, growth: -0.113 },
      { name: 'ASUS', units: 5.5, share: 0.087, unitsYearAgo: 6.0, shareYearAgo: 0.076, growth: -0.086 },
      { name: 'Others', units: 18.4, share: 0.294, unitsYearAgo: 21.4, shareYearAgo: 0.273, growth: -0.14 },
    ],
    total: { units: 62.7, unitsYearAgo: 78.5, growth: -0.201 },
    reading: 'The first outside count of Apple’s September quarter: Mac shipments fell 11% while the PC market fell 20%, so Apple gained a point of share as it lost units. That fits management’s warning that supply constraints on the Mac would grow, and it follows a June quarter in which Mac revenue grew 29%. It is the number to set against the Surface launch in the AI-and-rivals debate: so far the rivals are shrinking faster.',
    debate: 'aapl-ai',
  },
  {
    symbol: 'NVDA', id: 'nvda-ai-servers-2026', market: 'AI servers, worldwide (forecast)', period: '2026',
    publisher: 'TrendForce', title: 'Global AI Server Shipments Forecast to Grow Over 28% YoY in 2026, with a Rising Share of ASIC-Based Systems, Says TrendForce',
    date: '2026-01-20', url: 'https://www.trendforce.com/presscenter/news/20260120-12887.html', preliminary: false, unit: '',
    rows: [], total: null,
    figures: [
      { label: 'AI server shipments, 2026', value: 'more than 28% growth' },
      { label: 'GPU-based share of shipments', value: '69.7%' },
      { label: 'ASIC-based share of shipments', value: '27.8%, the highest since 2023' },
    ],
    update: {
      date: '2026-04-09', title: 'Server Market Bulletin - Apr. 9, 2026', url: 'https://www.trendforce.com/research/download/RP260409WL3',
      text: 'Meta’s in-house chip delays boost GPU demand; ASIC share revised slightly downward as GPU maintains over seventy percent share.',
    },
    reading: 'An independent count of the custom-chip threat: on TrendForce’s January forecast, more than a quarter of the AI servers shipped this year run on custom chips, the highest share since 2023, and the rest on GPUs. Its April bulletin trimmed the custom share as one large buyer’s own chip slipped. The direction the bears describe is real; the pace, so far, is slower than they fear, and a slipping custom chip turns into GPU orders.',
    debate: 'nvda-custom',
  },
];

export const marketsFor = (symbol: string) => MARKETS.filter((m) => m.symbol === symbol);
