/* ==========================================================================
   Maz Vantage — what changed in a company's risk factors

   A 10-K's Item 1A is the company's own list of what could hurt it, written
   by its lawyers and re-filed every year. Most of it carries over word for
   word, which is what makes the changes worth reading: a new risk factor, a
   heading rewritten, a paragraph added about an event since the last filing.

   How a review is made: the two latest 10-Ks are read from EDGAR in session,
   Item 1A is split into its headed risk factors, each is matched to last
   year's by its heading and opening, and the sentences are compared one by
   one. The counts below are that comparison's. The changes listed are the
   ones a reader should know about, chosen and described by us, in our words;
   a quotation is kept only where the company's own wording is the point,
   and is never more than fifteen words. The filings are linked, never
   hosted, and nothing here enters a grade.

   Changes that cite an event dated after the earlier filing are new by
   construction. Rewording is noted only where it changes what the company
   says, not where it tidies the sentence.
   ========================================================================== */

export type RiskChangeKind = 'new' | 'removed' | 'reworded' | 'expanded';

export const CHANGE_LABEL: Record<RiskChangeKind, string> = {
  new: 'New', removed: 'Removed', reworded: 'Heading rewritten', expanded: 'Expanded',
};

export interface RiskFiling {
  /** the company's fiscal year the 10-K covers */
  fiscalYear: number;
  periodEnd: string;
  filed: string;
  url: string;
  /** headed risk factors in Item 1A */
  count: number;
}

export interface RiskChange {
  kind: RiskChangeKind;
  /** the company's own grouping of its risk factors */
  group: string;
  /** ours: what the risk factor is about, in a few words */
  subject: string;
  /** ours: what changed, one to three sentences */
  what: string;
  /** a short line of the company's own, where its wording is the point; fifteen words at most */
  quote?: string;
}

export interface RiskFactorReview {
  symbol: string;
  /** the day the comparison was made */
  readOn: string;
  current: RiskFiling;
  previous: RiskFiling;
  /** from the comparison: headings kept word for word, rewritten, added and dropped */
  counts: { sameHeading: number; reworded: number; added: number; dropped: number };
  /** ours: the reading in one paragraph */
  summary: string;
  changes: RiskChange[];
}

export const RISK_REVIEWS: RiskFactorReview[] = [
  {
    symbol: 'AAPL',
    readOn: '2026-10-12',
    current: { fiscalYear: 2025, periodEnd: '2025-09-27', filed: '2025-10-31', count: 27, url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm' },
    previous: { fiscalYear: 2024, periodEnd: '2024-09-28', filed: '2024-11-01', count: 28, url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm' },
    counts: { sameHeading: 21, reworded: 6, added: 0, dropped: 1 },
    summary: 'Apple’s list barely changed in shape: no new risk factor, one dropped, and six headings rewritten, most of them '
      + 'to broaden rather than to warn. The substance moved inside the paragraphs. The trade section now describes the tariffs '
      + 'announced from the second quarter of fiscal 2025 and names rare earths among the inputs at risk, and the margin risk '
      + 'is restated as volatility and downward pressure on gross margins rather than as seasonal swings in quarterly sales. '
      + 'Artificial intelligence now appears in five risk factors, from product defects to personal data, up from two.',
    changes: [
      {
        kind: 'expanded', group: 'Macroeconomic and Industry Risks', subject: 'Trade disputes and tariffs',
        what: 'Adds the tariffs announced on US imports from the second quarter of fiscal 2025, including on China, India, Japan, '
          + 'South Korea, Taiwan, Vietnam and the EU, and the retaliation they drew. Rare earths join the components and raw '
          + 'materials whose cost or availability restrictive measures can affect.',
      },
      {
        kind: 'reworded', group: 'Financial Risks', subject: 'Net sales and gross margins',
        what: 'The heading no longer says quarterly results will fluctuate; it now says net sales and gross margins are subject '
          + 'to volatility and downward pressure. The discussion of the seasonal holiday quarter is gone, and the paragraph now '
          + 'lists industry-wide pricing pressure and the weight of a single product category among the causes.',
      },
      {
        kind: 'removed', group: 'Business Risks', subject: 'Retail stores',
        what: 'Apple’s retail stores, last year a risk factor of their own, no longer have one; the stores are mentioned only in passing elsewhere.',
      },
      {
        kind: 'reworded', group: 'Business Risks', subject: 'Carriers and resellers',
        what: 'Wholesalers and retailers drop out of the heading, which now names carriers and other resellers only. The warning '
          + 'that device financing and subsidies can be withdrawn, last year about carriers, now covers every reseller.',
      },
      {
        kind: 'reworded', group: 'Business Risks', subject: 'New strategies and acquisitions',
        what: 'Commercial relationships join new business strategies and acquisitions as things that could disrupt the business.',
      },
      {
        kind: 'reworded', group: 'Legal and Regulatory Compliance Risks', subject: 'Personal data',
        what: 'The heading widens from data protection to the collection, use, protection and transfer of personal data. New '
          + 'text covers online-safety laws, including protections for minors and mandatory age verification, and the higher '
          + 'risk of disclosing personal data that comes with AI features.',
      },
      {
        kind: 'reworded', group: 'Legal and Regulatory Compliance Risks', subject: 'Environmental and social expectations',
        what: 'The heading drops “environmental, social and governance” for varied stakeholder expectations about social and '
          + 'other issues, and the text reframes the company’s environmental goals as statements about its values.',
      },
      {
        kind: 'expanded', group: 'Legal and Regulatory Compliance Risks', subject: 'Litigation and investigations',
        what: 'Adds that the risk of novel legal claims may grow as AI is built further into the products, and that licensing '
          + 'agreements made to resolve claims can reduce revenue as well as raise costs.',
      },
      {
        kind: 'expanded', group: 'Business Risks', subject: 'Key people and the workforce',
        what: 'Names immigration, labour and export-control laws as things that can limit hiring a global workforce, and the '
          + 'cost of competing for talent in particular fields.',
      },
    ],
  },
  {
    symbol: 'NVDA',
    readOn: '2026-10-12',
    current: { fiscalYear: 2026, periodEnd: '2026-01-25', filed: '2026-02-25', count: 24, url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm' },
    previous: { fiscalYear: 2025, periodEnd: '2025-01-26', filed: '2025-02-26', count: 23, url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581025000023/nvda-20250126.htm' },
    counts: { sameHeading: 21, reworded: 2, added: 1, dropped: 0 },
    summary: 'NVIDIA added one risk factor and dropped none, but the year’s change is in two places. The export-control section, '
      + 'about as long as before, was rewritten around the year’s events: the H20 licence requirement and the charge that '
      + 'followed, licences granted on terms that include an expected revenue share and an import tariff, and the company’s '
      + 'statement that it is effectively shut out of China’s data center market. And a new risk factor covers what the build-out asks of NVIDIA itself: capacity commitments, '
      + 'guarantees and requests to finance customers, alongside a supply risk that now names energy, data centers and '
      + 'capital as constraints on demand.',
    changes: [
      {
        kind: 'new', group: 'Risks Related to Our Global Operating Business', subject: 'Counterparty risk in commercial arrangements',
        what: 'A new risk factor: long-term capacity purchase obligations and financial guarantees expose NVIDIA to customers and '
          + 'partners who cannot meet their commitments or raise financing. Customers have asked it to finance data center '
          + 'build-outs; it says it has not entered into any financing arrangement.',
        quote: 'We have not entered into any financing arrangements.',
      },
      {
        kind: 'expanded', group: 'Risks Related to Regulatory, Legal, Our Stock, and Other Matters', subject: 'Export controls and China',
        what: 'Records the April 2025 licence requirement on H20 and a US$4.5b charge for excess inventory and purchase obligations; '
          + 'H20 licences in August 2025 that produced about US$60m of revenue, with US officials expecting 15% or more of licensed '
          + 'sales; an H200 licence in February 2026 with no revenue yet and a 25% import tariff; and China’s preliminary antitrust '
          + 'finding of September 2025.',
        quote: 'we were effectively foreclosed from competing in China\'s data center computing/compute market',
      },
      {
        kind: 'reworded', group: 'Risks Related to Demand, Supply, and Manufacturing', subject: 'Supply, capacity and demand',
        what: 'The heading swaps component availability for capacity availability. New text says customers’ build-outs depend '
          + 'on data centers, energy and capital, and that shortages of any of them could delay deployments and NVIDIA’s revenue.',
      },
      {
        kind: 'expanded', group: 'Risks Related to Our Global Operating Business', subject: 'Investments and acquisitions',
        what: 'Adds the investments NVIDIA makes across its ecosystem, many in companies that may never be profitable, as a '
          + 'source of gains, losses and volatility in its results.',
      },
      {
        kind: 'expanded', group: 'Risks Related to Our Industry and Markets', subject: 'Meeting the market’s needs',
        what: 'Adds the intellectual property licence with Groq, which required significant non-refundable payments that NVIDIA '
          + 'may not recover if the technology does not reach its products.',
      },
      {
        kind: 'expanded', group: 'Risks Related to Our Global Operating Business', subject: 'Customer concentration',
        what: 'Now says some indirect customers are estimated to be 10% or more of revenue individually.',
      },
      {
        kind: 'reworded', group: 'Risks Related to Regulatory, Legal, Our Stock, and Other Matters', subject: 'Sustainability scrutiny',
        what: '“Increased” drops out of the heading on scrutiny of NVIDIA’s sustainability practices; the substance is unchanged.',
      },
    ],
  },
];

export function riskReviewFor(symbol: string): RiskFactorReview | null {
  return RISK_REVIEWS.find((r) => r.symbol === symbol) || null;
}
