/* ==========================================================================
   Maz Vantage — the key debates on a stock

   The few questions that decide what the shares are worth, each argued from
   both sides by the people with a stake in the answer: management on its
   call, the sell-side analysts questioning it, fund managers in their
   letters, published research, competitors. Each side's evidence is a short
   verbatim quote with one line of ours on what it argues. Then what our own
   measures say, which side today's price already pays for (computed by the
   page from the reverse DCF, never written here), what would settle the
   question, and the next date it gets tested.

   The consensus map on the Research tab is drawn from these records: sources
   down the side, debates across the top, each cell the side that group's
   evidence takes.

   Rules (pinned in tests/debates.test.ts):
   - a quote is at most 35 words, verbatim, any cut marked by an ellipsis;
   - every quote already on the page as an outside voice is copied from
     research-voices.ts exactly; a new quote names its source and date, and a
     call quote is checked against the transcript before it ships;
   - an analyst's question is a concern raised, not a rating, and is filed
     on the side it points to;
   - `ours` states what our figures show without a number that will move
     (the page prints the live figures beside it);
   - nothing here enters a grade.
   ========================================================================== */

import type { VoiceKind } from './research-voices';

export type Side = 'bull' | 'bear';

export interface Evidence {
  side: Side;
  kind: VoiceKind;
  quote: string;
  speaker: string;
  role?: string;
  source: string;
  date: string;
  letterId?: string;
  url?: string;
  /** ours: what the quote argues, in one line */
  point: string;
}

/** Which of the reverse DCF's readings the debate turns on, so the page can say which side the price pays for. */
export type Measure = 'growth' | 'margin' | null;

export interface Debate {
  symbol: string;
  id: string;
  /** the question, as a reader would ask it */
  question: string;
  /** a column head for the consensus map */
  short: string;
  /** ours: why the answer moves the value */
  why: string;
  measure: Measure;
  evidence: Evidence[];
  /** ours: what our own figures say, and which way they lean */
  ours: { side: Side | 'mixed'; text: string };
  /** what evidence would settle it */
  settle: string;
  /** the next dated test; `date` may be "next" to use the earnings date the page carries */
  next: { what: string; date: string; basis: string };
}

/* ---------- shared sources -------------------------------------------------- */

const AAPL_CALL = { source: 'Q3 fiscal 2026 earnings call', date: '2026-07-30' };
const COOK = { speaker: 'Tim Cook', role: 'Chief executive, Apple' };
const PAREKH = { speaker: 'Kevan Parekh', role: 'Chief financial officer, Apple' };
const FUNDSMITH = {
  speaker: 'Terry Smith', role: 'Fundsmith', source: 'Fundsmith Equity Fund, 2025 annual letter', date: '2026-01',
  letterId: 'fundsmith-fundsmith-equity-fund-2025-annual-letter-to-shareholders',
};
const BARON = {
  speaker: 'Baron Capital', source: 'Baron Funds quarterly report, June 30, 2026', date: '2026-08',
  letterId: 'baron-baron-funds-quarterly-report-june-30-2026',
};
const NEW_WEST = {
  speaker: 'New West Capital', source: 'The Good, the Bad, and the Deteriorating', date: '2026-07-14',
  letterId: 'new-west-capital-the-good-the-bad-and-the-deteriorating',
};
const NVDA_CALL = { source: 'Q2 fiscal 2027 earnings call', date: '2026-08-26' };
const KRESS = { speaker: 'Colette Kress', role: 'Chief financial officer, NVIDIA' };
const HUANG = { speaker: 'Jensen Huang', role: 'Founder and chief executive, NVIDIA' };

/* ---------- Apple ----------------------------------------------------------- */

const AAPL: Debate[] = [
  {
    symbol: 'AAPL', id: 'aapl-growth', short: 'Growth',
    question: 'Can revenue grow fast enough to carry the price?',
    why: 'Most of the gap between the price and the fair value estimate is growth: the shares need more of it, for longer, than the analysts forecast.',
    measure: 'growth',
    evidence: [
      { side: 'bull', kind: 'management', ...COOK, ...AAPL_CALL,
        quote: 'Today, Apple is pleased to report $109.4 billion in revenue, up 16% from a year ago and a June quarter record.',
        point: 'The latest quarter grew at a rate the price would be content with.' },
      { side: 'bull', kind: 'management', ...COOK, ...AAPL_CALL,
        quote: 'It’s a demand forecast issue, to be candid, where the iPhone and the Mac are both doing remarkably better than we thought they would do.',
        point: 'Demand is running ahead of the company’s own plan; supply, not appetite, is the limit.' },
      { side: 'bear', kind: 'analyst', ...AAPL_CALL, speaker: 'Amit Daryanani', role: 'Evercore ISI',
        quote: '…if I think about the 9%-11% sort of growth that’s guided for September, it’s about a 500 basis point or so deceleration versus what we’ve seen really in June quarter…',
        point: 'The guide already slows, before any harder comparison arrives.' },
      { side: 'bear', kind: 'letter', ...BARON,
        quote: 'Our non-ownership of Microsoft Corporation and Apple Inc. were the two largest individual contributors to relative performance during the quarter.',
        point: 'A growth manager that chose not to own it, and was paid for the choice.' },
    ],
    ours: { side: 'mixed', text: 'Filed revenue has compounded at a high single-digit rate over five years, a little less over nine, and the latest quarter ran well above both; the consensus path the models extend grows more slowly than that record over ten years. Our estimate uses the consensus path, which is why it sits below the price.' },
    settle: 'Revenue growth in the September and December quarters against the 9–11% guide, and whether the consensus for the next two fiscal years rises to meet the rate the price implies.',
    next: { what: 'Fiscal fourth-quarter results', date: 'next', basis: 'the expected date in the earnings calendar' },
  },
  {
    symbol: 'AAPL', id: 'aapl-services', short: 'Services',
    question: 'Is Services a durable profit engine, or the part regulators will reprice?',
    why: 'Services earns a far higher margin than hardware, so its growth and its take rate decide how far the overall margin can rise.',
    measure: null,
    evidence: [
      { side: 'bull', kind: 'management', ...PAREKH, ...AAPL_CALL,
        quote: 'With our large install base of over two and a half billion active devices, we have an incredibly strong foundation for growth opportunities.',
        point: 'Every device sold adds to the base services revenue is earned from.' },
      { side: 'bull', kind: 'letter', ...FUNDSMITH,
        quote: 'Apple has its devices and about a billion mostly high-end consumers locked into them and increasingly into its services.',
        point: 'A long-term holder’s reading: the lock-in is the moat.' },
      { side: 'bear', kind: 'analyst', ...AAPL_CALL, speaker: 'Erik Woodring', role: 'Morgan Stanley',
        quote: '…just 12% services growth was just a bit below your guidance.',
        point: 'The high-margin line slowed below the company’s own guide.' },
      { side: 'bear', kind: 'management', ...PAREKH, ...AAPL_CALL,
        quote: 'In the U.S., we do continue to operate under a court ruling impacting the link-out transactions. We’re pleased the Supreme Court will hear our appeal.',
        point: 'App Store economics are already under a court order, with the appeal still to be heard.' },
    ],
    ours: { side: 'mixed', text: 'The installed base and the return on capital say the franchise is intact; nothing in the filed figures yet shows a regulatory hit, which is the point: the risk sits in the courts, not in the accounts.' },
    settle: 'Services growth against guidance over the next two quarters, and the Supreme Court’s decision on the link-out appeal.',
    next: { what: 'Services growth in the fiscal fourth-quarter results', date: 'next', basis: 'the expected date in the earnings calendar' },
  },
  {
    symbol: 'AAPL', id: 'aapl-margin', short: 'Margins',
    question: 'Can pricing power absorb the memory cost shock?',
    why: 'The price assumes margins well above anything filed; a cost shock that sticks moves the estimate the other way.',
    measure: 'margin',
    evidence: [
      { side: 'bull', kind: 'management', ...COOK, ...AAPL_CALL,
        quote: 'We did it because we’re in what I would characterize as a 100-year flood on the memory pricing, with exponential increases in memory prices.',
        point: 'Apple raised prices to pass the cost on: pricing power, used.' },
      { side: 'bear', kind: 'management', ...PAREKH, ...AAPL_CALL,
        quote: '…more than 100% of that can be explained by the memory cost change that Tim outlined.',
        point: 'Gross margin fell, and input costs explain all of the fall.' },
      { side: 'bear', kind: 'management', ...PAREKH, ...AAPL_CALL,
        quote: 'We expect gross margin to be between 47%-48%. This includes an expected benefit of approximately one percentage point related to tariff refunds.',
        point: 'Take out a one-off refund and the guide steps down again.' },
    ],
    ours: { side: 'bear', text: 'Operating margin has widened over the filed record and stands at its peak, but the price needs it to go far beyond that peak on the consensus revenue path; the company’s own gross margin guide points the other way for now.' },
    settle: 'The September-quarter gross margin against the 47–48% guide, and whether the price rises hold without costing units.',
    next: { what: 'Gross margin in the fiscal fourth-quarter results', date: 'next', basis: 'the expected date in the earnings calendar' },
  },
  {
    symbol: 'AAPL', id: 'aapl-ai', short: 'AI and rivals',
    question: 'Is staying out of the AI infrastructure race a strength, or how the ecosystem gets attacked?',
    why: 'The device lock-in is what the returns rest on; a rival that breaks it, or an AI feature Apple cannot ship, goes to the moat rather than to one quarter.',
    measure: null,
    evidence: [
      { side: 'bull', kind: 'letter', ...FUNDSMITH,
        quote: 'Depending upon your point of view it has either been left behind in the scramble to build Large Language Models (‘LLMs’) and hyperscale to provide AI infrastructure or it has opted out of the race.',
        point: 'Not spending on AI infrastructure keeps the capital light and the returns high.' },
      { side: 'bull', kind: 'management', ...COOK, ...AAPL_CALL,
        quote: 'The new multi-year agreement with Broadcom, which is part of Apple’s American Manufacturing Program, is expected to exceed $30 billion.',
        point: 'The silicon spending goes into its own devices, not into data centers.' },
      { side: 'bear', kind: 'competitor', speaker: 'Microsoft', role: 'Surface launch post, under “Break up with your MacBook”',
        source: 'Pre-order our most powerful Surface devices ever', date: '2026-10-07',
        url: 'https://blogs.windows.com/devices/2026/10/07/pre-order-our-most-powerful-surface-devices-ever/',
        quote: 'If you’ve outgrown the compromises of a traditional professional laptop, we’ll help make the switch.',
        point: 'A rival now names the MacBook Pro, with NVIDIA silicon inside, and pays to switch.' },
      { side: 'bear', kind: 'management', ...COOK, ...AAPL_CALL,
        quote: 'We have not been able to do that in the European Union, but we’re working closely with them to try to get to something that would allow us to offer Siri AI there.',
        point: 'The AI features cannot yet ship in one of its largest markets.' },
    ],
    ours: { side: 'mixed', text: 'Return on invested capital is near the top of the peer set and capital spending stays a small share of revenue: the restraint shows in the figures. The threat does not show in share yet: iPhone and Mac revenue grew 22% and 29% in the June quarter, and in IDC’s first count of the September quarter Mac shipments fell 11% while the PC market fell 20%.' },
    settle: 'Mac revenue in the quarters after the Surface launch, and when the AI features reach the European Union.',
    next: { what: 'Surface Laptop Ultra ships', date: '2026-10-16', basis: 'Microsoft’s launch post' },
  },
];

/* ---------- NVIDIA ---------------------------------------------------------- */

const NVDA: Debate[] = [
  {
    symbol: 'NVDA', id: 'nvda-growth', short: 'Growth runway',
    question: 'How long can the data center build-out keep growing at this pace?',
    why: 'The price needs very high growth for a decade, not for a year; the value turns on how long the build-out lasts, not on next year’s figure.',
    measure: 'growth',
    evidence: [
      { side: 'bull', kind: 'management', ...KRESS, ...NVDA_CALL,
        quote: 'We expect to grow revenue by approximately 70% in fiscal 2028. This is a supply-constrained outlook.',
        point: 'A full-year guide a year out, the first the company has given, and capped by supply rather than demand.' },
      { side: 'bull', kind: 'management', ...KRESS, ...NVDA_CALL,
        quote: 'Customers forecasts point to our growth, doubling next year.',
        point: 'Customers’ own plans run ahead of what NVIDIA can ship.' },
      { side: 'bear', kind: 'research', ...NEW_WEST,
        quote: 'The spread nearly closed in early 2023, in the depths of the gaming and crypto downturn, before the AI cycle sent it vertical.',
        point: 'Three years ago returns fell to the cost of capital: this has been a cyclical business.' },
      { side: 'bear', kind: 'analyst', ...NVDA_CALL, speaker: 'Stacy Rasgon', role: 'Bernstein Research',
        quote: '…it’s a constrained number. What would it be if it wasn’t constrained?',
        point: 'When growth is set by supply, the forecast rests on suppliers’ capacity as much as on demand.' },
    ],
    ours: { side: 'mixed', text: 'Filed revenue has compounded at more than 60% a year over five years, and the published consensus years keep up a similar pace; the consensus path the models extend slows sharply after them, and the price sits above that path.' },
    settle: 'Whether the third-quarter result meets the US$108 billion guide, and whether the 70% guide for fiscal 2028 holds as Vera Rubin supply ramps.',
    next: { what: 'Third-quarter fiscal 2027 results', date: '2026-11-17', basis: 'the date given on the Q2 call' },
  },
  {
    symbol: 'NVDA', id: 'nvda-custom', short: 'Custom chips',
    question: 'Will custom chips from its largest customers take the share NVIDIA now has?',
    why: 'The largest buyers design their own accelerators; every workload they move costs NVIDIA volume and pricing at once.',
    measure: null,
    evidence: [
      { side: 'bull', kind: 'management', ...HUANG, ...NVDA_CALL,
        quote: 'NVIDIA is a platform, an entire AI factory platform that spans the entire AI life cycle that you can use in any cloud, it\'s in every cloud.',
        point: 'A custom chip serves one cloud; the platform serves every one, and the customers outside the hyperscalers.' },
      { side: 'bear', kind: 'letter', ...BARON,
        quote: '…custom silicon accelerators are on pace to match GPU units in volume by next year…',
        point: 'Broadcom’s chief executive, as a Broadcom holder reports him: custom chips are catching up in units.' },
      { side: 'bear', kind: 'analyst', ...NVDA_CALL, speaker: 'Vivek Arya', role: 'Bank of America',
        quote: '…a lot of these investments are designed to help the frontier labs, especially open AI and Anthropic, but both of them are designing their own custom chips.',
        point: 'The labs NVIDIA funds are building alternatives to it.' },
    ],
    ours: { side: 'bull', text: 'Operating margin is near its filed peak and return on capital leads the peer set: there is no sign yet in the accounts of the pricing pressure share loss would bring.' },
    settle: 'The hyperscale share of data center revenue, and gross margin once the memory reset has passed through.',
    next: { what: 'Third-quarter fiscal 2027 results', date: '2026-11-17', basis: 'the date given on the Q2 call' },
  },
  {
    symbol: 'NVDA', id: 'nvda-financing', short: 'Customer financing',
    question: 'Is NVIDIA now financing its own demand?',
    why: 'Revenue backed by NVIDIA’s own balance sheet is worth less than revenue paid for by a customer’s, and it returns as a loss if the customer cannot pay.',
    measure: null,
    evidence: [
      { side: 'bull', kind: 'management', ...KRESS, ...NVDA_CALL,
        quote: 'We recognize the scale of this support, and we know some will call this circular financing. We see it differently.',
        point: 'Management names the concern and argues the investments are returns on capital, not props to sales.' },
      { side: 'bull', kind: 'management', ...HUANG, ...NVDA_CALL,
        quote: 'I think the only regret that I have is that I didn\'t invest more and sooner.',
        point: 'The chief executive treats the lab stakes as investments he wishes were larger, not as a cost of selling chips.' },
      { side: 'bear', kind: 'management', ...KRESS, ...NVDA_CALL,
        quote: 'For context, we expect demand from the AI labs for which we expect to leverage our balance sheet to contribute toward roughly a quarter of our business next year.',
        point: 'A quarter of next year’s business leans on NVIDIA’s own balance sheet.' },
      { side: 'bear', kind: 'management', ...KRESS, ...NVDA_CALL,
        quote: 'Days of sales outstanding increased to 60 days, reflecting extended payment terms for large purchases by certain investment-grade customers to be shipped over multiple quarters.',
        point: 'Customers are being given longer to pay.' },
    ],
    ours: { side: 'bear', text: 'The cash flow statement still converts most profit to free cash flow, so the risk is not yet in the figures; it sits in commitments and guarantees that the accounts carry off the income statement.' },
    settle: 'Receivable days, the commitments and guarantees note in the next 10-Q, and whether free cash flow keeps pace with net income.',
    next: { what: 'Third-quarter fiscal 2027 results and 10-Q', date: '2026-11-17', basis: 'the date given on the Q2 call' },
  },
  {
    symbol: 'NVDA', id: 'nvda-margin', short: 'Margins',
    question: 'Do memory costs cap the margin the price depends on?',
    why: 'At this scale a point of gross margin is worth billions of operating profit a year, and the price already needs margins above any filed.',
    measure: 'margin',
    evidence: [
      { side: 'bull', kind: 'management', ...KRESS, ...NVDA_CALL,
        quote: 'Tighter memory supply is a symptom of the same demand surge that\'s driving our own growth.',
        point: 'The cost shock and the demand come from the same build-out.' },
      { side: 'bear', kind: 'management', ...KRESS, ...NVDA_CALL,
        quote: 'We expect margins to bottom in Q4 in the 71% to 72% range before settling at 72% to 73% in fiscal year \'28, as executed price increases take effect in Q1.',
        point: 'The guide resets margins below the 75% just reported, for a year at least.' },
    ],
    ours: { side: 'bear', text: 'Operating margin is already near its filed peak; the price needs it to rise well past that peak on the consensus revenue path, while the company guides gross margin lower.' },
    settle: 'Fourth-quarter gross margin against the 71–72% guide, and whether price increases in the first quarter of fiscal 2028 lift it back.',
    next: { what: 'Third-quarter gross margin against the 74% guide', date: '2026-11-17', basis: 'the date given on the Q2 call' },
  },
];

export const DEBATES: Debate[] = [...AAPL, ...NVDA];

export const debatesFor = (symbol: string) => DEBATES.filter((d) => d.symbol === symbol);

/** Groups for the consensus map: who is speaking, in the order the map lists them. */
export const MAP_GROUPS: { key: string; label: string; kinds: VoiceKind[] }[] = [
  { key: 'management', label: 'Management', kinds: ['management', 'company'] },
  { key: 'analyst', label: 'Sell-side questions', kinds: ['analyst'] },
  { key: 'investor', label: 'Fund letters and research', kinds: ['letter', 'research'] },
  { key: 'competitor', label: 'Competitors', kinds: ['competitor'] },
];

export type Cell = Side | 'split' | null;

/** The side a group's evidence takes on one debate: one side, both ('split'), or none. */
export function cellOf(d: Debate, kinds: VoiceKind[]): Cell {
  const sides = new Set(d.evidence.filter((e) => kinds.includes(e.kind)).map((e) => e.side));
  if (!sides.size) return null;
  return sides.size > 1 ? 'split' : [...sides][0];
}
