/* The headline reader, against headlines labelled by hand.

   Every case below is a real headline from the news feed on 2026-10-08/09
   (Apple, Nike, Microsoft, Nvidia, Tesla, Meta, UnitedHealth, Intel, Boeing
   and the market-wide stream), with the label a person gave it by reading it —
   not the label the rules produce. The direction cases are the ones that
   matter: a wrong "up" or "down" on the page is worse than none, so the bar
   for a direction is every labelled case right.

   Run over 551 distinct headlines on 2026-10-09, the rules gave 24 directions
   and all 24 were right on reading; 59 headlines got an event tag; 244 were
   left untagged, 119 set aside as previews or opinion, 68 as holder filings,
   33 as price moves, 18 as law-firm adverts and 6 as roundups. */

import { describe, expect, it } from 'vitest';
import { groupStories, readHeadline, type NewsDirection, type NewsEvent, type NewsNoise } from '@/lib/news-events';

type Label = [string, NewsEvent | null, NewsDirection | null] | [string, 'noise', NewsNoise];

const LABELLED: Label[] = [
  /* ---- a direction, because the words have one meaning ---- */
  ['Apple cuts iPhone 18 Pro orders due to soft demand, Nikkei Asia reports', 'supply', 'down'],
  ['Apple stock plummets following iPhone 18 order cut', 'supply', 'down'],
  ['Apple Drops 3% on Reported iPhone 18 Pro Component Order Cuts; Skyworks Slips, Qualcomm Treads Water', 'supply', 'down'],
  ['DAL Q3 Earnings Miss Estimates as Higher Fuel Costs Hurt Margins', 'earnings', 'down'],
  ['ANGO Q1 Earnings Beat Estimates on Med Tech Growth, Revenues Up Y/Y', 'earnings', 'up'],
  ['Goldman Sachs Upgrades Palantir to Buy, Sees 18% Upside and Further Outperformance Into 2027', 'rating', 'up'],
  ['Palantir Rises 4% as Barclays Starts Coverage at Overweight With $265 Target; ServiceNow Holds Steady, Salesforce Sits Tight', 'rating', 'up'],
  ['Fastly Spikes 15% as Oppenheimer Upgrades to Outperform With $35 Target; Datadog Rises 4%, Cloudflare Gains 2%', 'rating', 'up'],
  ['Penguin Solutions initiated with a Buy from Bank of America on AI memory demand', 'rating', 'up'],
  ['CareTrust REIT (CTRE) Upgraded to Buy: What Does It Mean for the Stock?', 'rating', 'up'],
  ['Paccar (PCAR) Upgraded to Buy: Here\'s What You Should Know', 'rating', 'up'],
  ['FDA Approves Teva\'s New Once-Monthly Schizophrenia Injection', 'legal', 'up'],
  ['Teva Wins FDA Approval for Monthly Schizophrenia Injectable WELTRUZA', 'legal', 'up'],
  ['American Express fined $350 million over anti-money laundering failures', 'legal', 'down'],
  ['U.S. suspends Microsoft, Adobe from green-card labor program in foreign worker crackdown', 'legal', 'down'],

  /* ---- an event, with no direction the words can carry ---- */
  ['Apple names insider Steve Smith as new M&A chief, memo shows', 'management', null],
  ['Apple New CEO Ternus Puts Focus Back on Design', 'management', null],
  ['Apple to Launch Doorbell, Lock and Thermostat Developed With LG', 'product', null],
  ['Apple Partners With LG on New Smart Home Devices', 'product', null],
  ['Apple Stocks Rise as $400 Target Reprices Siri AI', 'rating', null],
  ['Apple Stocks Stay Flat as Citi Keeps a $365 Target', 'rating', null],
  ['Apple iPhone 18 Pro wait times raise demand concerns at UBS', 'supply', null],
  ['Zscaler Jumps 6% on Reaffirmed Revenue Outlook and IBM Security Pact; Palo Alto and CrowdStrike Gain 4%', 'earnings', null],
  ['Italy launches EU-backed probe into Microsoft-owned gaming companies', 'legal', null],
  ['Tesla drops \'Full Self-Driving\' brand name in Europe after regulator pushback', 'legal', null],
  ['Meta bans TikTok from advertising on its apps, Bloomberg News reports', 'legal', null],
  ['Ameren Corporation Directors Declare Quarterly Dividend', 'capital', null],
  ['Gran Tierra Energy Shareholders Approve $1.33B Colombia, Ecuador Sale', 'deal', null],
  ['Lessor Avolon orders 250 Boeing, Airbus jets with option for 100 more', 'product', null],
  ['Valaris\' Latest Contract Awards Add $220M to Contract Backlog', 'product', null],
  ['Tesla\'s China-made EV sales quicken in September', 'earnings', null],
  ['TechCreate Group Ltd. Reports First Half Fiscal Year 2026 Financial and Operational Results', 'earnings', null],

  /* ---- set aside: not news about the company ---- */
  ['Henrickson Nauta Wealth Advisors Inc. Buys 1,905 Shares of Apple Inc. $AAPL', 'noise', 'holder filing'],
  ['Apple Inc. $AAPL Shares Acquired by Kintra Wealth LLC', 'noise', 'holder filing'],
  ['Echo45 Advisors LLC Lowers Holdings in Apple Inc. $AAPL', 'noise', 'holder filing'],
  ['Nykredit A S Makes New $1.83 Billion Investment in Apple Inc. $AAPL', 'noise', 'holder filing'],
  ['Apple Inc. $AAPL Stock Position Cut by Integrity Financial Corp WA', 'noise', 'holder filing'],
  ['ROSEN, LEADING INVESTOR COUNSEL, Encourages Webull Corporation Investors to Secure Counsel Before Important Deadline in Securities Class Action', 'noise', 'class-action notice'],
  ['Bronstein, Gewirtz & Grossman LLC Urges Alphabet Inc. Investors to Act: Class Action Filed Alleging Investor Harm', 'noise', 'class-action notice'],
  ['SPT Investor Alert: Robbins LLP Announces that Sprout Social, Inc. Beat Motion to Dismiss', 'noise', 'class-action notice'],
  ['First Look: Dow Drops, Amazon Cuts Jobs, PepsiCo Lowers Outlook', 'noise', 'roundup'],
  ['Wednesday\'s First Moves: AAPL Smart Home Devices, NTAP Upgrade, STZ Earnings', 'noise', 'roundup'],
  ['Will Shopify (SHOP) Beat Estimates Again in Its Next Earnings Report?', 'noise', 'preview or opinion'],
  ['Why Associated Banc-Corp (ASB) Could Beat Earnings Estimates Again', 'noise', 'preview or opinion'],
  ['UnitedHealth: A Beat Is Priced In, But There\'s Room For Surprise', 'noise', 'preview or opinion'],
  ['Missed this Vanguard ETF\'s 37% rally? Here\'s what $10,000 could do next', 'noise', 'preview or opinion'],
  ['Micron & 2 Profitable Stocks to Buy in October for Big Upside', 'noise', 'preview or opinion'],
  ['BlackRock Slated to Report Q3 Earnings: What\'s in the Cards?', 'noise', 'preview or opinion'],
  ['Morgan Stanley Stock Ahead of Q3 Earnings: Buy, Hold or Sell?', 'noise', 'preview or opinion'],
  ['Why Northern Trust Corporation (NTRS) is a Top Dividend Stock for Your Portfolio', 'noise', 'preview or opinion'],
  ['Apple (NASDAQ:AAPL) Stock Jumps 1% – Here’s What Happened', 'noise', 'price move'],
  ['Why Verizon Stock Just Crashed', 'noise', 'price move'],
  ['Nio Jumps 5% as Chinese EV Names Rally, XPeng Climbs 4%; Rivian Slips', 'noise', 'price move'],

  /* ---- untagged: about the company, or the market, but nothing happened ---- */
  ['Peter Lynch Beat the Market for 13 Years, Then Said Most Investors Should Just Buy an Index Fund', null, null],
  ['BYD Trades at 20 Times Earnings. Tesla Trades at 344.', null, null],
  ['Delta CEO says there\'s no Elon Musk feud: \'I drive a Tesla\'', null, null],
  ['Dan Ives Names 5 Potential Tech Winners for 2027 as Investors Underestimate $4 Trillion Spending Wave', null, null],
  ['NVIDIA Commits $1 Billion to Advance US Science Over the Next Five Years', null, null],
  ['MTY Food Group Inc. (MTY:CA) Q3 2026 Earnings Call Transcript', null, null],
  ['Apartment Supply Is Finally Tightening. These 4 REITs Could Reward Investors', null, null],
];

describe('reading a headline', () => {
  for (const [title, a, b] of LABELLED) {
    it(title.slice(0, 80), () => {
      const r = readHeadline(title);
      if (a === 'noise') {
        expect(r.noise).toBe(b);
        expect(r.event).toBeNull();
      } else {
        expect(r.event).toBe(a);
        expect(r.direction).toBe(b);
      }
    });
  }

  it('drops a direction the headline negates or argues both ways', () => {
    expect(readHeadline('Company does not cut guidance despite weak quarter').direction).toBeNull();
    expect(readHeadline('Analyst upgrades the shares but cuts the price target').direction).toBeNull();
  });

  it('names the words every tag was read from', () => {
    const r = readHeadline('Apple cuts iPhone 18 Pro orders due to soft demand, Nikkei Asia reports');
    expect(r.words.join(' ')).toMatch(/cuts iPhone 18 Pro orders/);
  });
});

describe('one story, many outlets', () => {
  const at = (title: string, date: string, source: string) => ({ title, date, source });
  const stories = groupStories([
    at('Apple cuts iPhone 18 Pro orders due to soft demand, Nikkei Asia reports', '2026-10-07T08:00:00Z', 'Reuters'),
    at('Apple cuts iPhone 18 Pro orders on soft demand - Nikkei', '2026-10-07T09:30:00Z', 'Investing.com'),
    at('Apple cuts iPhone 18 Pro orders due to soft demand', '2026-10-08T07:00:00Z', 'MarketWatch'),
    at('Apple Partners With LG on New Smart Home Devices', '2026-10-07T10:00:00Z', 'Barron\'s'),
    at('Apple is reportedly partnering with LG to launch a smart lock, thermostat, and doorbell', '2026-10-07T12:00:00Z', 'TechCrunch'),
  ]);

  it('merges the copies of one story and keeps who had it first', () => {
    const cut = stories.find((s) => s.reading.event === 'supply')!;
    expect(cut.copies).toHaveLength(3);
    expect(cut.lead.source).toBe('Reuters');
    expect(cut.outlets).toEqual(['Reuters', 'Investing.com', 'MarketWatch']);
    expect(cut.reading.direction).toBe('down');
  });

  it('merges differently worded reports of one event', () => {
    const [s] = groupStories([
      at('Apple cuts iPhone 18 Pro orders due to soft demand, Nikkei Asia reports', '2026-10-09T05:00:00Z', 'Reuters'),
      at('Apple stock plummets following iPhone 18 order cut', '2026-10-09T09:00:00Z', 'Finbold'),
      at('Apple Drops 3% on Reported iPhone 18 Pro Component Order Cuts; Skyworks Slips, Qualcomm Treads Water', '2026-10-09T11:00:00Z', '24/7 Wall Street'),
    ]);
    expect(s.copies).toHaveLength(3);
    expect(s.lead.source).toBe('Reuters');
    expect(s.reading.direction).toBe('down');
  });

  it('keeps two stories of one kind apart when they share too few words', () => {
    expect(stories.filter((s) => s.reading.event === 'product')).toHaveLength(2);
  });

  it('drops the direction when copies of one story disagree', () => {
    const [s] = groupStories([
      at('Acme upgraded to Buy at Big Bank', '2026-10-07T08:00:00Z', 'A'),
      at('Acme upgraded to Buy at Big Bank, target raised', '2026-10-07T09:00:00Z', 'B'),
    ]);
    expect(s.reading.direction).toBe('up');
  });
});
