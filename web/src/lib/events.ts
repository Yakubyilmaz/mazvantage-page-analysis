/* ==========================================================================
   Maz Vantage — company events

   One record per real-world event (a product launch, a contract, a
   partnership), written once and shown on every company it touches, each
   from its own side: the maker, the customer, the partner, the competitor.

   How a record is made (tools/events/README.md):
     1. a headline or filing flags the event;
     2. tools/events/follow.py follows it to the companies' own
        announcements and stores those in the document corpus;
     3. a person reads the primary sources and writes the record: facts
        with the source each came from, every party with its role and one
        paragraph of ours on what it means for that company.

   **Confidence** is part of the record, never implied: `confirmed` means
   the company itself announced it; `reported` means the press says so and no
   primary source has been found; `rumour` means unnamed sources. A vendor's
   own performance claim is kept apart from the facts and labelled as the
   vendor's. Nothing here enters a grade.
   ========================================================================== */

export type EventKind = 'product-launch' | 'contract' | 'partnership' | 'acquisition' | 'guidance' | 'regulatory';
export type Confidence = 'confirmed' | 'reported' | 'rumour';
export type Role = 'maker' | 'customer' | 'design partner' | 'co-developer' | 'competitor' | 'supplier' | 'partner' | 'acquirer' | 'target';

/* ---------- mergers and acquisitions ------------------------------------------

   A deal is an event with a timeline. Its stages are dated and sourced one by
   one, and the stage it has reached is the last one done. The terms are the
   parties' own; the figures `dealMath` derives from them (premium, the value
   of a stock offer today, the spread, the size against the buyer) are ours,
   from market prices captured on a stated date. Management's accretion and
   synergy figures stay in the event's `claims`. */

export type DealStage = 'reported' | 'agreed' | 'filed' | 'regulatory' | 'vote' | 'closed' | 'terminated';

export interface DealStep {
  stage: DealStage;
  /** the day it happened, or the expected date when not yet done */
  date: string;
  what: string;
  done: boolean;
  /** index into the event's `sources` */
  source: number;
}

export interface DealTerms {
  acquirer: string;
  target: string;
  /** listed target, so its price can be read */
  targetSymbol?: string;
  consideration: 'cash' | 'stock' | 'cash and stock' | 'undisclosed';
  /** headline value, US$, as the parties state it */
  value: number;
  valueBasis: string;
  /** target shares receive this many acquirer shares (a stock deal) */
  exchangeRatio?: number;
  /** stated value per target share at announcement */
  perShare?: number;
  /** the target's last close before the news, the base a premium is measured from */
  unaffected?: { date: string; price: number };
  /** the acquirer price the stated value was struck on */
  acquirerRef?: { date: string; price: number };
  /** prices captured for the spread */
  latest?: { date: string; target?: number; acquirer?: number };
  /** the acquirer's market value on the agreement date, to size the deal */
  acquirerMarketCap?: { date: string; value: number };
  /** the latest date the parties give for closing */
  expectedBy: string;
  expectedLabel: string;
  outsideDate?: string;
  breakFee?: { amount: number; note: string };
  approvals: string[];
  steps: DealStep[];
  /** ours: what the deal does to each side's Shariah screen, pro forma */
  shariah: string;
}

export interface DealFigures {
  /** stated offer over the unaffected close */
  premium: number | null;
  /** a stock offer's value per target share at the latest acquirer price */
  offerNow: number | null;
  /** the deal's headline value at the latest acquirer price */
  valueNow: number | null;
  /** offer now over the target's latest price: what the market leaves on the table */
  spread: number | null;
  /** the spread annualised to the expected close */
  spreadAnnual: number | null;
  daysToClose: number | null;
  /** headline value over the acquirer's market value */
  materiality: number | null;
  /** the last stage done */
  stage: DealStage | null;
}

const DAY = 864e5;

export function dealMath(d: DealTerms): DealFigures {
  const premium = d.perShare && d.unaffected ? d.perShare / d.unaffected.price - 1 : null;
  const stockNow = d.exchangeRatio && d.latest?.acquirer ? d.exchangeRatio * d.latest.acquirer : null;
  const offerNow = d.consideration === 'stock' ? stockNow : d.consideration === 'cash' ? d.perShare ?? null : null;
  const valueNow = d.consideration === 'stock' && d.acquirerRef && d.latest?.acquirer
    ? d.value * (d.latest.acquirer / d.acquirerRef.price) : null;
  const spread = offerNow && d.latest?.target ? offerNow / d.latest.target - 1 : null;
  const days = d.latest ? Math.round((Date.parse(d.expectedBy) - Date.parse(d.latest.date)) / DAY) : null;
  const spreadAnnual = spread !== null && days && days > 0 ? (1 + spread) ** (365 / days) - 1 : null;
  const materiality = d.acquirerMarketCap ? d.value / d.acquirerMarketCap.value : null;
  const done = d.steps.filter((x) => x.done);
  return { premium, offerNow, valueNow, spread, spreadAnnual, daysToClose: days, materiality, stage: done.length ? done[done.length - 1].stage : null };
}

export interface EventParty {
  name: string;
  /** US listing, when there is one; a party without one is named but not linked */
  symbol?: string;
  role: Role;
  /** ours: what the event means for this company, from its side */
  why: string;
}

export interface EventSource {
  kind: 'primary' | 'press';
  publisher: string;
  title: string;
  date: string;
  url: string;
}

export interface EventFact {
  label: string;
  value: string;
  /** index into `sources` */
  source: number;
}

export interface VendorClaim {
  claim: string;
  by: string;
  /** what the claim rests on, in the vendor's own footnotes */
  basis: string;
  source: number;
}

export interface CorpEvent {
  id: string;
  /** the day it happened: the launch, the signing */
  date: string;
  /** when it was first announced, if earlier */
  announced?: string;
  kind: EventKind;
  confidence: Confidence;
  title: string;
  /** ours: two or three sentences on what happened */
  summary: string;
  facts: EventFact[];
  claims?: VendorClaim[];
  /** set when the event is a merger or acquisition */
  deal?: DealTerms;
  parties: EventParty[];
  sources: EventSource[];
  /** a short verbatim line from a primary source, with its speaker */
  /** `org` is the party the speaker speaks for, so a page can tell its own management from another company */
  quotes?: { text: string; speaker: string; role: string; org?: string; source: number }[];
}

export const EVENTS: CorpEvent[] = [
  {
    id: 'nvda-msft-rtx-spark-launch-2026-10',
    date: '2026-10-07',
    announced: '2026-06-01',
    kind: 'product-launch',
    confidence: 'confirmed',
    title: 'NVIDIA’s RTX Spark (N1X) reaches Windows laptops, led by Microsoft’s Surface Laptop Ultra',
    summary: 'NVIDIA’s first chip for Windows PCs, unveiled at GTC Taipei in June, went on pre-order on 7 October at a joint Microsoft–NVIDIA '
      + 'event in San Francisco. The flagship is Microsoft’s Surface Laptop Ultra from US$2,599, shipping 16 October, with machines from '
      + 'ASUS, Dell, HP, Lenovo and MSI the same day and compact desktops in November. Microsoft is marketing it directly against Apple’s MacBook Pro.',
    facts: [
      { label: 'Chip', value: 'RTX Spark superchip (sold as N1X): Blackwell RTX GPU with up to 6,144 CUDA cores, 20-core Grace Arm CPU, up to 128 GB unified memory, up to 1 petaflop of AI compute', source: 0 },
      { label: 'CPU design', value: 'MediaTek collaborated with NVIDIA on the custom Arm CPU', source: 0 },
      { label: 'First announced', value: '1 June 2026, GTC Taipei', source: 0 },
      { label: 'Launch', value: 'Pre-orders 7 October 2026; laptops ship 16 October; compact desktops in November', source: 1 },
      { label: 'Surface Laptop Ultra', value: 'From US$2,599 (MSRP); 15-inch; up to 128 GB memory', source: 2 },
      { label: 'Surface RTX Spark Dev Box', value: 'US$5,999 (MSRP), Microsoft.com in the US only, ships November', source: 2 },
      { label: 'Other makers at launch', value: 'ASUS, Dell, HP, Lenovo and MSI', source: 3 },
      { label: 'Other makers to follow', value: 'Acer and GIGABYTE', source: 0 },
      { label: 'Software partners', value: 'Adobe rearchitecting Photoshop and Premiere for RTX Spark; Xbox, Blender, ComfyUI among 100+ supporters', source: 0 },
      { label: 'Aimed at Apple', value: 'Up to US$1,000 cash back for trading in an eligible MacBook Pro, 7 October – 23 November 2026, US only', source: 2 },
      { label: 'Not disclosed', value: 'Chip pricing to PC makers, unit volumes or revenue expectations', source: 0 },
    ],
    claims: [
      {
        claim: 'Windows PCs with RTX Spark run local AI 2.1x faster to first token, 4.3x faster for AI images and 6.2x faster for AI video than a MacBook Pro 16-inch with M5 Pro.',
        by: 'Microsoft',
        basis: 'Microsoft-commissioned testing in September 2026 on pre-production machines (64 GB) against a MacBook Pro with M5 Pro and 64 GB.',
        source: 3,
      },
      {
        claim: 'Surface Laptop Ultra has up to 25% brighter peak HDR than a MacBook Pro with M5.',
        by: 'Microsoft',
        basis: 'Microsoft’s own footnoted comparison.',
        source: 2,
      },
    ],
    parties: [
      {
        name: 'NVIDIA', symbol: 'NVDA', role: 'maker',
        why: 'The first NVIDIA chip that runs Windows as the main processor, which takes CUDA and its AI software stack from the data centre '
          + 'and the add-in graphics card into the laptop itself. The silicon is not new: it is the GB10 that has powered the DGX Spark '
          + 'mini-PCs for a year, now in a Windows machine. No pricing to PC makers, volumes or revenue expectations were given, so the '
          + 'effect on results cannot be sized; against the data-centre business it will be small for some time. The strategic gain is a '
          + 'seat inside the PC itself, with Microsoft as design partner.',
      },
      {
        name: 'Microsoft', symbol: 'MSFT', role: 'design partner',
        why: 'Surface is the launch device, and Windows gains native security for on-device agents built with NVIDIA. Microsoft frames it '
          + 'as “hybrid intelligence”: some AI work moves onto customers’ own hardware rather than its cloud. Surface itself is a small '
          + 'part of Microsoft’s revenue; the point is a credible Arm-based Windows machine at the top of the market, and an offer aimed '
          + 'squarely at MacBook Pro owners.',
      },
      {
        name: 'Apple', symbol: 'AAPL', role: 'competitor',
        why: 'Microsoft is marketing against the MacBook Pro by name: a trade-in of up to US$1,000 and its own benchmarks claiming two to '
          + 'six times faster local AI. The Mac was US$10.4b of Apple’s US$109.4b revenue in the June quarter, growing 29%, so the revenue '
          + 'directly at stake is about a tenth of the company. What is contested is a claim Apple has made its own, that unified-memory Macs '
          + 'are the best machines to run AI locally. Until independent tests and sell-through data exist, the performance claims are the vendors’.',
      },
      {
        name: 'MediaTek', role: 'co-developer',
        why: 'Co-designed the Arm CPU. Listed in Taiwan only, so it is named here but has no report on this site.',
      },
      {
        name: 'Qualcomm', symbol: 'QCOM', role: 'competitor',
        why: 'Qualcomm’s Snapdragon X has been the Arm chip in Windows laptops. RTX Spark makes NVIDIA a second Arm supplier to Windows, aimed '
          + 'at the premium end with a far larger graphics engine, and Microsoft chose it for its flagship Surface.',
      },
      {
        name: 'Intel', symbol: 'INTC', role: 'competitor',
        why: 'Intel supplies most Windows laptops. Microsoft’s most powerful Surface is not built on an Intel chip, and Lenovo, HP, Dell, '
          + 'ASUS and MSI are shipping the alternative at launch. The machines are expensive, so the volumes at risk are at the premium end first.',
      },
      {
        name: 'AMD', symbol: 'AMD', role: 'competitor',
        why: 'AMD sells both the x86 processors and the graphics that premium creator laptops use, the market RTX Spark is aimed at. A '
          + 'single NVIDIA chip with up to 128 GB of shared memory competes with both halves of that sale.',
      },
    ],
    sources: [
      { kind: 'primary', publisher: 'NVIDIA', title: 'NVIDIA and Microsoft Reinvent Windows PCs for the Age of Personal AI', date: '2026-06-01',
        url: 'https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-and-Microsoft-Reinvent-Windows-PCs-for-the-Age-of-Personal-AI/default.aspx' },
      { kind: 'primary', publisher: 'NVIDIA', title: 'NVIDIA, Microsoft Kick Off a New Beginning for Windows PCs with RTX Spark and AI Agents', date: '2026-10-07',
        url: 'https://blogs.nvidia.com/blog/local-ai-rtx-spark-microsoft-windows-event/' },
      { kind: 'primary', publisher: 'Microsoft', title: 'Pre-order our most powerful Surface devices ever', date: '2026-10-07',
        url: 'https://blogs.windows.com/devices/2026/10/07/pre-order-our-most-powerful-surface-devices-ever/' },
      { kind: 'primary', publisher: 'Microsoft', title: 'Building Windows for hybrid intelligence', date: '2026-10-07',
        url: 'https://blogs.windows.com/windowsexperience/2026/10/07/building-windows-for-hybrid-intelligence/' },
      { kind: 'press', publisher: 'ServeTheHome', title: 'Microsoft Launches Surface Laptop Ultra, Surface RTX Spark Dev Box', date: '2026-10-08',
        url: 'https://www.servethehome.com/microsoft-launches-surface-laptop-ultra-surface-rtx-spark-dev-box/' },
      { kind: 'press', publisher: 'Tom’s Hardware', title: 'Microsoft and Nvidia launch Surface Laptop Ultra with RTX Spark starting at $2,599', date: '2026-10-07',
        url: 'https://www.tomshardware.com/laptops/microsoft-and-nvidia-launch-surface-laptop-ultra-with-rtx-spark-rtx-spark-preorders-live-now-coinciding-with-major-windows-11-changes-for-agentic-ai' },
    ],
    quotes: [
      { text: 'The PC is being reinvented.', speaker: 'Jensen Huang', role: 'Founder and chief executive, NVIDIA', org: 'NVIDIA', source: 0 },
      { text: 'Our goal is to deliver unmetered intelligence to every home and every desk with Windows.', speaker: 'Satya Nadella', role: 'Chairman and chief executive, Microsoft', org: 'Microsoft', source: 0 },
      { text: 'If you’ve outgrown the compromises of a traditional professional laptop, we’ll help make the switch.', speaker: 'Microsoft', role: 'Surface launch post, under “Break up with your MacBook”', org: 'Microsoft', source: 2 },
      { text: '…this is fundamentally the same GB10 we have been looking at for the last year.', speaker: 'ServeTheHome', role: 'Press review', source: 4 },
    ],
  },
  {
    id: 'nvda-hugging-face-2026-09',
    date: '2026-09-02',
    kind: 'acquisition',
    confidence: 'confirmed',
    title: 'NVIDIA agrees to buy Hugging Face for about US$12.9 billion',
    summary: 'NVIDIA signed a definitive agreement on 2 September to acquire Hugging Face, the open platform where developers share and '
      + 'deploy AI models, and confirmed it the next day after The Information had reported the deal. The price is about US$11.9 billion to '
      + 'Hugging Face’s stockholders plus up to about US$1.0 billion of equity retention for its staff. Closing is expected in the first half of '
      + '2027, subject to regulatory approval.',
    facts: [
      { label: 'Agreement', value: 'Definitive agreement signed 2 September 2026', source: 0 },
      { label: 'Price', value: 'About US$11.9 billion payable to Hugging Face stockholders, subject to adjustments, plus an equity retention program of up to about US$1.0 billion for staff joining NVIDIA', source: 0 },
      { label: 'Headline value', value: 'US$12,930,300,000, as NVIDIA’s chief executive put it', source: 1 },
      { label: 'Form of payment', value: 'Not stated', source: 0 },
      { label: 'How it was filed', value: '8-K Item 8.01 (other events), not Item 1.01 (a material agreement)', source: 0 },
      { label: 'Expected close', value: 'First half of 2027, subject to customary conditions including regulatory approvals', source: 0 },
      { label: 'Stated commitment', value: 'Hugging Face stays open; NVIDIA compute will not be required to build on or deploy through it', source: 1 },
      { label: 'Platform scale', value: '18 million+ developers, researchers and creators; 3 million+ models; 200,000+ companies', source: 1 },
      { label: 'Not disclosed', value: 'Termination fee, Hugging Face revenue or profit, accounting effect', source: 0 },
    ],
    parties: [
      {
        name: 'NVIDIA', symbol: 'NVDA', role: 'acquirer',
        why: 'At about US$12.9 billion the price is a quarter of one percent of NVIDIA’s US$5.43 trillion market value on the day it signed, '
          + 'small enough that NVIDIA filed it as an “other event” rather than a material agreement, and too small to move the financials. '
          + 'What it buys is position: the place where open models are published and chosen, the layer above NVIDIA’s chips. The promise that '
          + 'NVIDIA hardware will not be required is the price of keeping developers there; the risk is that model builders see a conflict and '
          + 'move elsewhere. A rival platform would be the sign to watch.',
      },
      {
        name: 'Hugging Face', role: 'target',
        why: 'Privately held, so it has no report here. Press accounts put its last priced round at a US$4.5 billion valuation in 2023, '
          + 'which would make this sale nearly three times that; the figure is reported, not disclosed by either company.',
      },
    ],
    deal: {
      acquirer: 'NVIDIA', target: 'Hugging Face', consideration: 'undisclosed',
      value: 12_930_300_000, valueBasis: 'US$11.9b to stockholders plus up to US$1.0b of retention equity',
      acquirerMarketCap: { date: '2026-09-02', value: 5_428_477_900_000 },
      expectedBy: '2027-06-30', expectedLabel: 'first half of 2027',
      approvals: ['Required regulatory approvals'],
      steps: [
        { stage: 'reported', date: '2026-08-27', what: 'The Information reports the deal, citing a person with knowledge of it', done: true, source: 3 },
        { stage: 'agreed', date: '2026-09-02', what: 'Definitive agreement signed', done: true, source: 0 },
        { stage: 'filed', date: '2026-09-03', what: '8-K filed; NVIDIA confirms on its blog', done: true, source: 0 },
        { stage: 'regulatory', date: '2027-06-30', what: 'Regulatory approvals', done: false, source: 0 },
        { stage: 'closed', date: '2027-06-30', what: 'Expected close, first half of 2027', done: false, source: 0 },
      ],
      shariah: 'No change expected to NVIDIA’s screen. Hugging Face is a software platform with no line of business in an excluded '
        + 'activity on the evidence here, the price is about 0.24% of NVIDIA’s market value, and no borrowing is disclosed to pay for it. '
        + 'Its own revenue is not disclosed, so the impure-income check stays open until the first combined filing.',
    },
    sources: [
      { kind: 'primary', publisher: 'NVIDIA (SEC)', title: 'Form 8-K, Item 8.01', date: '2026-09-03',
        url: 'https://www.sec.gov/Archives/edgar/data/0001045810/000104581026000078/nvda-20260902.htm' },
      { kind: 'primary', publisher: 'NVIDIA', title: 'NVIDIA to Acquire Hugging Face', date: '2026-09-03',
        url: 'https://blogs.nvidia.com/blog/nvidia-to-acquire-hugging-face/' },
      { kind: 'press', publisher: 'TechCrunch', title: 'Nvidia confirms it will buy Hugging Face for $12.9 billion', date: '2026-09-03',
        url: 'https://techcrunch.com/2026/09/03/nvidia-confirms-it-will-buy-hugging-face-for-12-9-billion/' },
      { kind: 'press', publisher: 'CNBC', title: 'Nvidia agrees to buy Hugging Face for $12.9 billion, report says', date: '2026-08-27',
        url: 'https://www.cnbc.com/2026/08/27/nvidia-hugging-face-acquisition.html' },
    ],
    quotes: [
      { text: 'Hugging Face will remain an open platform for the entire AI ecosystem.', speaker: 'Jensen Huang', role: 'Founder and chief executive, NVIDIA', org: 'NVIDIA', source: 1 },
    ],
  },
  {
    id: 'htb-brbs-merger-2026-08',
    date: '2026-08-16',
    kind: 'acquisition',
    confidence: 'confirmed',
    title: 'HomeTrust Bancshares agrees to buy Blue Ridge Bankshares in an all-stock deal',
    summary: 'HomeTrust signed on 16 August to acquire Blue Ridge for 0.086 of a HomeTrust share per Blue Ridge share, valued at about '
      + 'US$448.1 million, or US$4.28 a share, when announced. The combined bank would hold over US$7 billion of assets across about 60 '
      + 'locations in the Southeast, with HomeTrust holders owning about 65%. Both companies’ shareholders must approve; closing is expected '
      + 'early in the first quarter of 2027.',
    facts: [
      { label: 'Agreement', value: 'Signed 16 August 2026; announced 17 August', source: 0 },
      { label: 'Exchange ratio', value: '0.086 HomeTrust share per Blue Ridge share, cash for fractions', source: 0 },
      { label: 'Stated value', value: 'About US$448.1 million, US$4.28 per Blue Ridge share, on HomeTrust’s five-day average of about US$49.82 to 14 August', source: 1 },
      { label: 'Price / tangible book', value: '140% (164% counting warrant dilution)', source: 2 },
      { label: 'Price / 2027E earnings', value: '21.4x; 9.6x with the planned cost savings', source: 2 },
      { label: 'Ownership after', value: 'About 65% HomeTrust, 35% Blue Ridge', source: 1 },
      { label: 'Combined bank', value: 'Over US$7 billion of assets; 27 HomeTrust and 33 Blue Ridge branches', source: 2 },
      { label: 'Approvals', value: 'Blue Ridge shareholders; HomeTrust stockholders (share issuance); bank regulators', source: 0 },
      { label: 'Termination fee', value: 'US$18.0 million, payable by either side in certain circumstances', source: 0 },
      { label: 'Outside date', value: '16 August 2027', source: 0 },
      { label: 'Board', value: 'Two Blue Ridge directors join HomeTrust’s board', source: 0 },
      { label: 'Credit mark', value: 'US$24.5 million gross, 1.2% of Blue Ridge’s loans', source: 2 },
      { label: 'Registration', value: 'S-4 filed 2 October 2026', source: 3 },
    ],
    claims: [
      { claim: 'The deal adds 23.2% to HomeTrust’s 2027 earnings per share and 29.8% on a run-rate basis.', by: 'HomeTrust', basis: 'Investor presentation, assuming cost savings of 45%+ of Blue Ridge’s non-interest expense, 75% phased in during 2027.', source: 2 },
      { claim: 'Tangible book value per share is diluted 8.3% at closing and earned back in about 3.25 years.', by: 'HomeTrust', basis: 'Investor presentation estimate.', source: 2 },
    ],
    parties: [
      {
        name: 'HomeTrust Bancshares', symbol: 'HTB', role: 'acquirer',
        why: 'HomeTrust is paying in its own shares, so its holders give up about a third of the combined bank for earnings growth that rests '
          + 'on cutting nearly half of Blue Ridge’s costs. It pays 140% of tangible book for a bank whose own chief executive says it has just '
          + 'finished cleaning up legacy problems, and books an 8.3% dilution it expects to earn back in a little over three years. Its share '
          + 'price has fallen since the announcement, which has also lowered what the deal is worth.',
      },
      {
        name: 'Blue Ridge Bankshares', symbol: 'BRBS', role: 'target',
        why: 'Holders receive HomeTrust shares, not cash, so their payout moves with HomeTrust’s price: the offer has lost value since August '
          + 'along with it. The premium over the last close before the news was modest for a bank sale, and the narrow spread today says the '
          + 'market expects the deal to close. The risks left are the two shareholder votes and the regulators.',
      },
    ],
    deal: {
      acquirer: 'HomeTrust Bancshares', target: 'Blue Ridge Bankshares', targetSymbol: 'BRBS', consideration: 'stock',
      value: 448_100_000, valueBasis: 'HomeTrust’s five-day volume-weighted price of about US$49.82 to 14 August 2026',
      exchangeRatio: 0.086, perShare: 4.28,
      unaffected: { date: '2026-08-14', price: 3.69 },
      acquirerRef: { date: '2026-08-14', price: 49.82 },
      latest: { date: '2026-10-09', target: 3.84, acquirer: 45.71 },
      expectedBy: '2027-03-31', expectedLabel: 'early in the first quarter of 2027',
      outsideDate: '2027-08-16',
      breakFee: { amount: 18_000_000, note: 'payable by HomeTrust or Blue Ridge in certain circumstances' },
      approvals: ['Blue Ridge shareholders', 'HomeTrust stockholders', 'Bank regulators'],
      steps: [
        { stage: 'agreed', date: '2026-08-16', what: 'Merger agreement signed', done: true, source: 0 },
        { stage: 'filed', date: '2026-08-17', what: 'Announced; 8-K Item 1.01 with the release and investor presentation', done: true, source: 0 },
        { stage: 'filed', date: '2026-10-02', what: 'S-4 registration statement filed', done: true, source: 3 },
        { stage: 'vote', date: '2027-03-31', what: 'Both shareholder votes', done: false, source: 0 },
        { stage: 'regulatory', date: '2027-03-31', what: 'Bank regulatory approvals', done: false, source: 0 },
        { stage: 'closed', date: '2027-03-31', what: 'Expected close, early in the first quarter of 2027', done: false, source: 1 },
      ],
      shariah: 'No change: both are conventional, interest-based banks, which fail the business-activity screen before the deal and after it.',
    },
    sources: [
      { kind: 'primary', publisher: 'HomeTrust (SEC)', title: 'Form 8-K, Items 1.01, 7.01, 9.01', date: '2026-08-17',
        url: 'https://www.sec.gov/Archives/edgar/data/1538263/000153826326000107/htbi-20260816.htm' },
      { kind: 'primary', publisher: 'HomeTrust and Blue Ridge', title: 'Joint press release (Exhibit 99.1)', date: '2026-08-17',
        url: 'https://www.sec.gov/Archives/edgar/data/1538263/000153826326000107/htb-brbsxmergerpressrele.htm' },
      { kind: 'primary', publisher: 'HomeTrust', title: 'Investor presentation (Exhibit 99.2)', date: '2026-08-17',
        url: 'https://www.sec.gov/Archives/edgar/data/1538263/000153826326000107/htb-brbsxinvestorpresent.htm' },
      { kind: 'primary', publisher: 'HomeTrust (SEC)', title: 'Form S-4 registration statement', date: '2026-10-02',
        url: 'https://www.sec.gov/Archives/edgar/data/1538263/000110465926113346/tm2626525-1_s4.htm' },
    ],
    quotes: [
      { text: 'Blue Ridge has successfully completed a clean-up of legacy challenges and repositioned itself for profitability and growth.', speaker: 'Harry Golliday', role: 'Interim president and chief executive, Blue Ridge', org: 'Blue Ridge Bankshares', source: 1 },
    ],
  },
];

/** The events that touch a company, newest first, each with the company's own part in it. */
export function eventsFor(symbol: string): { event: CorpEvent; party: EventParty }[] {
  return EVENTS
    .map((event) => ({ event, party: event.parties.find((p) => p.symbol === symbol) }))
    .filter((x): x is { event: CorpEvent; party: EventParty } => !!x.party)
    .sort((a, b) => b.event.date.localeCompare(a.event.date));
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: 'Confirmed by the companies',
  reported: 'Reported by the press, not confirmed',
  rumour: 'Rumour: unnamed sources',
};

export const KIND_LABEL: Record<EventKind, string> = {
  'product-launch': 'Product launch', contract: 'Contract', partnership: 'Partnership',
  acquisition: 'Acquisition', guidance: 'Guidance', regulatory: 'Regulatory',
};
