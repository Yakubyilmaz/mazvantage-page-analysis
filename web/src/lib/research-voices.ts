/* ==========================================================================
   Maz Vantage — outside voices in the Research report

   Short verbatim quotes, set beside the paragraph they bear on, from four
   kinds of source:

     management  the company's own executives, on its earnings call
     letter      fund managers' letters to their investors
     research    published research and outlooks from investment firms
     analyst     sell-side analysts' questions on the call — what the Street
                 is worried about, in its own words
     competitor  a rival company's own announcement, where it takes aim at
                 this one (lib/events.ts holds the full event)
     press       a named publication's reporting

   Each one says whether it **confirms** the paragraph, **challenges** it, or
   **adds** context the figures cannot carry, and carries one sentence of ours
   on why it sits there. The choice of quote is ours; the words are theirs.

   Rules: a quote is a sentence or less (at most 35 words, enforced by test),
   copied exactly, with any cut marked by an ellipsis; it is attributed to a
   named person or firm, dated, and linked to the publisher wherever a public
   copy exists. A fund letter in the library is linked through its library
   entry. Nothing here enters a grade.

   `after` anchors a quote below a paragraph: a paragraph number in the
   written narrative (0-based), or a key for the Quant section's generated
   paragraphs. Where the narrative is absent the quotes gather at the end of
   their section rather than land beside the wrong paragraph.
   ========================================================================== */

import { LETTERS } from './letters';

export type VoiceKind = 'management' | 'letter' | 'research' | 'analyst' | 'competitor' | 'company' | 'press';
export type Relation = 'confirms' | 'challenges' | 'adds';
export type VoiceSection = 'note' | 'strategy' | 'quant' | 'moat' | 'fairValue' | 'risk' | 'capital';

export interface Voice {
  symbol: string;
  section: VoiceSection;
  after: number | string;
  kind: VoiceKind;
  relation: Relation;
  quote: string;
  /** who said it: a person where the source names one, else the firm */
  speaker: string;
  /** their role, and the firm when the speaker is a person */
  role?: string;
  /** the document or event */
  source: string;
  date: string;
  /** a library letter's id; its link comes from the library */
  letterId?: string;
  url?: string;
  /** ours: why the quote sits beside this paragraph */
  note: string;
}

const CALL = { source: 'Q3 fiscal 2026 earnings call', date: '2026-07-30' };
const COOK = { speaker: 'Tim Cook', role: 'Chief executive, Apple' };
const PAREKH = { speaker: 'Kevan Parekh', role: 'Chief financial officer, Apple' };
const FUNDSMITH = {
  speaker: 'Terry Smith', role: 'Fundsmith', source: 'Fundsmith Equity Fund, 2025 annual letter', date: '2026-01',
  letterId: 'fundsmith-fundsmith-equity-fund-2025-annual-letter-to-shareholders',
};
const NEW_WEST = {
  speaker: 'New West Capital', source: 'The Good, the Bad, and the Deteriorating', date: '2026-07-14',
  letterId: 'new-west-capital-the-good-the-bad-and-the-deteriorating',
};

export const VOICES: Voice[] = [
  /* ---------- Analyst Note ------------------------------------------------ */
  {
    symbol: 'AAPL', section: 'note', after: 0, kind: 'management', relation: 'confirms', ...COOK, ...CALL,
    quote: 'Today, Apple is pleased to report $109.4 billion in revenue, up 16% from a year ago and a June quarter record.',
    note: 'The quarter the note opens on, in management’s words.',
  },
  {
    symbol: 'AAPL', section: 'note', after: 0, kind: 'analyst', relation: 'challenges', ...CALL,
    speaker: 'Amit Daryanani', role: 'Evercore ISI',
    quote: '…if I think about the 9%-11% sort of growth that’s guided for September, it’s about a 500 basis point or so deceleration versus what we’ve seen really in June quarter…',
    note: 'The beat came with a guide that slows sharply; the first question on the call was about that, not the beat.',
  },

  /* ---------- Business Strategy & Outlook --------------------------------- */
  {
    symbol: 'AAPL', section: 'strategy', after: 1, kind: 'management', relation: 'adds', ...COOK, ...CALL,
    quote: 'It’s a demand forecast issue, to be candid, where the iPhone and the Mac are both doing remarkably better than we thought they would do.',
    note: 'The product the mix leans on is, for now, selling ahead of the company’s own plan.',
  },
  {
    symbol: 'AAPL', section: 'strategy', after: 2, kind: 'management', relation: 'confirms', ...PAREKH, ...CALL,
    quote: 'With our large install base of over two and a half billion active devices, we have an incredibly strong foundation for growth opportunities.',
    note: 'The installed base is the asset services revenue is earned from, which is the paragraph’s argument.',
  },
  {
    symbol: 'AAPL', section: 'strategy', after: 2, kind: 'analyst', relation: 'challenges', ...CALL,
    speaker: 'Erik Woodring', role: 'Morgan Stanley',
    quote: '…just 12% services growth was just a bit below your guidance.',
    note: 'The higher-margin half of the mix slowed this quarter; management put it down mostly to currency and mobile gaming.',
  },
  {
    symbol: 'AAPL', section: 'strategy', after: 4, kind: 'letter', relation: 'adds', ...FUNDSMITH,
    quote: 'Depending upon your point of view it has either been left behind in the scramble to build Large Language Models (‘LLMs’) and hyperscale to provide AI infrastructure or it has opted out of the race.',
    note: 'The rise in research spending is not an AI-infrastructure build; Fundsmith reads the restraint as a possible strength.',
  },
  {
    symbol: 'AAPL', section: 'strategy', after: 4, kind: 'management', relation: 'adds', ...COOK, ...CALL,
    quote: 'The new multi-year agreement with Broadcom, which is part of Apple’s American Manufacturing Program, is expected to exceed $30 billion.',
    note: 'Where the silicon investment is going instead: custom components, made in the US.',
  },
  {
    symbol: 'AAPL', section: 'strategy', after: 5, kind: 'management', relation: 'adds', ...PAREKH, ...CALL,
    quote: 'As a result, we expect our September quarter total company revenue to grow between 9%-11% year-over-year.',
    note: 'The company’s own near-term guide, beside the consensus path the paragraph adopts.',
  },

  /* ---------- Quant Rating and Peer Comparison ---------------------------- */
  {
    symbol: 'AAPL', section: 'quant', after: 'profitability', kind: 'research', relation: 'confirms', ...NEW_WEST,
    quote: 'Its invested capital has barely moved in four years, and the return on that capital has quietly climbed, with a distinct step up in the past several quarters.',
    note: 'An outside reading of the same return on capital that ranks second among the peers here.',
  },
  {
    symbol: 'AAPL', section: 'quant', after: 'growth', kind: 'letter', relation: 'confirms',
    speaker: 'Baron Capital', source: 'Baron Funds quarterly report, June 30, 2026', date: '2026-08',
    letterId: 'baron-baron-funds-quarterly-report-june-30-2026',
    quote: 'Our non-ownership of Microsoft Corporation and Apple Inc. were the two largest individual contributors to relative performance during the quarter.',
    note: 'A growth manager that does not hold it, and was rewarded for that in the quarter: the growth and valuation readings, seen from outside.',
  },

  /* ---------- Economic Moat ----------------------------------------------- */
  {
    symbol: 'AAPL', section: 'moat', after: 1, kind: 'letter', relation: 'confirms', ...FUNDSMITH,
    quote: 'Apple has its devices and about a billion mostly high-end consumers locked into them and increasingly into its services.',
    note: 'The device-plus-services lock-in the paragraph names as the source of the returns.',
  },
  {
    symbol: 'AAPL', section: 'moat', after: 1, kind: 'research', relation: 'confirms',
    speaker: 'Eric Gordon', role: 'Brown Advisory', source: 'Equity Beat: Patios or Paris?', date: '2026-09-15',
    letterId: 'brown-equity-beat-patios-or-paris',
    quote: 'Few products have changed how people experience the world as profoundly as the iPhone.',
    note: 'An outside view of why customers stay: the phone as the device everything else runs through.',
  },
  {
    symbol: 'AAPL', section: 'moat', after: 2, kind: 'management', relation: 'adds', ...COOK, ...CALL,
    quote: 'We did it because we’re in what I would characterize as a 100-year flood on the memory pricing, with exponential increases in memory prices.',
    note: 'On raising prices. Passing a cost shock on to customers is what pricing power looks like in practice.',
  },
  {
    symbol: 'AAPL', section: 'moat', after: 2, kind: 'management', relation: 'challenges', ...PAREKH, ...CALL,
    quote: '…more than 100% of that can be explained by the memory cost change that Tim outlined.',
    note: 'On the 120-basis-point fall in gross margin: this time input costs are moving the margin.',
  },
  {
    symbol: 'AAPL', section: 'moat', after: 4, kind: 'competitor', relation: 'challenges',
    speaker: 'Microsoft', role: 'Surface launch post, under “Break up with your MacBook”', source: 'Pre-order our most powerful Surface devices ever', date: '2026-10-07',
    url: 'https://blogs.windows.com/devices/2026/10/07/pre-order-our-most-powerful-surface-devices-ever/',
    quote: 'If you’ve outgrown the compromises of a traditional professional laptop, we’ll help make the switch.',
    note: 'A rival now names the MacBook Pro and pays up to US$1,000 to switch: the reason to stay inside the ecosystem, tested directly. See Recent Developments.',
  },
  {
    symbol: 'AAPL', section: 'moat', after: 4, kind: 'analyst', relation: 'adds', ...CALL,
    speaker: 'Wamsi Mohan', role: 'Bank of America',
    quote: 'I’d love to get maybe a just a high-level take from you if you think that the competitive landscape here is changing…',
    note: 'He was asking about AI devices from new entrants: the threat to the reason to stay inside the ecosystem.',
  },

  /* ---------- Fair Value and Profit Drivers ------------------------------- */
  {
    symbol: 'AAPL', section: 'fairValue', after: 1, kind: 'letter', relation: 'adds', ...FUNDSMITH,
    quote: 'The year-end FCF yield of the S&P 500 was 2.8% and MSCI World was 3.1%.',
    note: 'A benchmark for the 3% free cash flow yield: about what the whole market offers, not a premium valuation by that measure alone.',
  },
  {
    symbol: 'AAPL', section: 'fairValue', after: 3, kind: 'management', relation: 'challenges', ...PAREKH, ...CALL,
    quote: 'We expect gross margin to be between 47%-48%. This includes an expected benefit of approximately one percentage point related to tariff refunds.',
    note: 'The consensus path holds margins; the company’s own guide has them stepping down, before a one-off benefit.',
  },

  /* ---------- Risk and Uncertainty ---------------------------------------- */
  {
    symbol: 'AAPL', section: 'risk', after: 3, kind: 'management', relation: 'adds', ...COOK, ...CALL,
    quote: 'We’re seeing some very significant constraints currently, with limited flexibility in the supply chain to remedy it.',
    note: 'A supply risk, not a demand one, and outside the six measured drivers.',
  },
  {
    symbol: 'AAPL', section: 'risk', after: 3, kind: 'research', relation: 'adds',
    speaker: 'Man Group', source: 'Technology Outlook H2 2026', date: '2026-07-10',
    letterId: 'man-technology-outlook-h2-2026-still-dancing-but-moving-closer-t',
    quote: 'Major global technology firms including Dell, HPQ, Apple and Cisco are increasingly sourcing components from Chinese manufacturers.',
    note: 'The China exposure runs through the supply chain as well as the sales line.',
  },
  {
    symbol: 'AAPL', section: 'risk', after: 4, kind: 'management', relation: 'confirms', ...PAREKH, ...CALL,
    quote: 'In the U.S., we do continue to operate under a court ruling impacting the link-out transactions. We’re pleased the Supreme Court will hear our appeal.',
    note: 'The kind of contingent risk the paragraph says a measured rating cannot see: a court case that touches App Store economics.',
  },
  {
    symbol: 'AAPL', section: 'risk', after: 4, kind: 'management', relation: 'confirms', ...COOK, ...CALL,
    quote: 'We have not been able to do that in the European Union, but we’re working closely with them to try to get to something that would allow us to offer Siri AI there.',
    note: 'Regulation already shapes where the new features can ship.',
  },

  /* ---------- Capital Allocation ------------------------------------------ */
  {
    symbol: 'AAPL', section: 'capital', after: 3, kind: 'management', relation: 'confirms', ...PAREKH, ...CALL,
    quote: 'During the quarter, we returned $33 billion to shareholders. This included $4 billion in dividends and equivalents and $25.8 billion in share repurchases.',
    note: 'The distribution pace continues in the latest quarter, still weighted to buybacks.',
  },
  {
    symbol: 'AAPL', section: 'capital', after: 3, kind: 'research', relation: 'confirms', ...NEW_WEST,
    quote: 'The five firms that clear their cost-of-capital hurdle with room to spare have, every one of them, shrunk their share counts — Apple by nearly a tenth…',
    note: 'The falling share count, measured independently over four years.',
  },
  {
    symbol: 'AAPL', section: 'capital', after: 5, kind: 'management', relation: 'adds', ...COOK, ...CALL,
    quote: 'As you know, this will be my final earnings call, and John will lead these calls going forward.',
    note: 'The succession the paragraph cannot assess is under way: John Ternus takes over as chief executive.',
  },
  {
    symbol: 'AAPL', section: 'capital', after: 5, kind: 'letter', relation: 'adds',
    speaker: 'Greg Abel', role: 'Berkshire Hathaway', source: 'Berkshire Hathaway, 2025 letter to shareholders', date: '2026-02-28',
    letterId: 'berkshire-2025',
    quote: '…businesses we understand well, have a high regard for their leaders, and expect will compound over decades.',
    note: 'Its largest outside holder’s view of the leadership this report does not judge, written of Apple among a handful of holdings.',
  },
];

/* ---------- NVIDIA ------------------------------------------------------- */

const NVDA_VOICES: Voice[] = [
  {
    symbol: 'NVDA', section: 'strategy', after: 2, kind: 'management', relation: 'adds',
    speaker: 'Jensen Huang', role: 'Founder and chief executive, NVIDIA', source: 'NVIDIA to Acquire Hugging Face', date: '2026-09-03',
    url: 'https://blogs.nvidia.com/blog/nvidia-to-acquire-hugging-face/',
    quote: 'Hugging Face will remain an open platform for the entire AI ecosystem.',
    note: 'The condition of the purchase: the platform only keeps its value if developers believe it stays neutral.',
  },
  {
    symbol: 'NVDA', section: 'moat', after: 1, kind: 'research', relation: 'confirms', ...NEW_WEST,
    quote: 'When the rest of the world is buying your chips to build their data centers, the capex wave becomes your revenue line, not your cost.',
    note: 'Why the data center returns rose while the capital base multiplied: NVIDIA is the supplier to the build-out, not its payer.',
  },
  {
    symbol: 'NVDA', section: 'moat', after: 3, kind: 'management', relation: 'adds',
    speaker: 'Jensen Huang', role: 'Founder and chief executive, NVIDIA', source: 'NVIDIA and Microsoft Reinvent Windows PCs for the Age of Personal AI', date: '2026-06-01',
    url: 'https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-and-Microsoft-Reinvent-Windows-PCs-for-the-Age-of-Personal-AI/default.aspx',
    quote: 'The PC is being reinvented.',
    note: 'The ambition behind RTX Spark, in the unveiling release. See Recent Developments for what shipped and the claims made against the MacBook Pro.',
  },
  {
    symbol: 'NVDA', section: 'moat', after: 4, kind: 'letter', relation: 'challenges',
    speaker: 'Baron Capital', source: 'Baron Funds quarterly report, June 30, 2026', date: '2026-08',
    letterId: 'baron-baron-funds-quarterly-report-june-30-2026',
    quote: '…custom silicon accelerators are on pace to match GPU units in volume by next year…',
    note: 'Broadcom’s chief executive, as a Broadcom holder reports him: the custom-chip threat to the data center franchise, in the words of its main supplier.',
  },
  {
    symbol: 'NVDA', section: 'fairValue', after: 2, kind: 'research', relation: 'confirms', ...NEW_WEST,
    quote: 'The spread nearly closed in early 2023, in the depths of the gaming and crypto downturn, before the AI cycle sent it vertical.',
    note: 'The fiscal 2023 trough, measured independently: the one year in ten that returns fell below the cost of capital.',
  },
];
VOICES.push(...NVDA_VOICES);

export const KIND_LABEL: Record<VoiceKind, string> = {
  management: 'Management', letter: 'Fund letter', research: 'Investment research', analyst: 'Sell-side analyst',
  competitor: 'Competitor', company: 'Company announcement', press: 'Press',
};
export const RELATION_LABEL: Record<Relation, string> = { confirms: 'Confirms', challenges: 'Challenges', adds: 'Context' };

/** A voice's link: the library's copy for a letter, else its own. */
export function linkOf(v: Voice): string | null {
  if (v.letterId) return LETTERS.find((l) => l.id === v.letterId)?.url || null;
  return v.url || null;
}

export const voicesFor = (symbol: string, section: VoiceSection) =>
  VOICES.filter((v) => v.symbol === symbol && v.section === section);

export const wordCount = (s: string) => s.trim().split(/\s+/).length;
