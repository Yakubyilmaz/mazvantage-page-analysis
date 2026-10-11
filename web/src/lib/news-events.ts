/* ==========================================================================
   Maz Vantage — what happened, read from headlines

   The news feed is newest-first and unsorted by importance, and most of it is
   not news about the company: wealth managers' 13F filings written up as
   articles, law firms advertising class actions, earnings previews, listicles,
   and price recaps that describe the chart rather than a cause. This tags each
   headline with one event from a fixed list, gives it a direction only where
   the words leave no doubt, sets the filler aside, and merges the copies one
   story gets across a dozen outlets.

   It does not score sentiment. "Apple crushes estimates but guidance
   disappoints" has no honest single direction, and a word count would give it
   one anyway. A direction here is a verb with one meaning — downgrades, cuts
   guidance, beats estimates, raises the dividend, recalls — and everything
   else carries its event tag and nothing more.

   Rule-based and fixed, like the management-voice reader: the same headline
   always reads the same way, and every tag names the words it was read from.
   Not part of the Alpha Signal score until the direction rules have been
   checked by hand against enough headlines to trust them
   (`tests/news-events.test.ts` holds the hand-labelled set).
   ========================================================================== */

export type NewsEvent = 'rating' | 'earnings' | 'deal' | 'legal' | 'management' | 'capital' | 'product' | 'supply';
export type NewsDirection = 'up' | 'down';
/** Why a headline is set aside rather than tagged. */
export type NewsNoise = 'holder filing' | 'class-action notice' | 'roundup' | 'price move' | 'preview or opinion';

export const EVENT_LABEL: Record<NewsEvent, string> = {
  rating: 'Analyst rating',
  earnings: 'Earnings or guidance',
  deal: 'Merger or acquisition',
  legal: 'Legal or regulatory',
  management: 'Management',
  capital: 'Buyback or dividend',
  product: 'Product, launch or contract',
  supply: 'Supply chain',
};

export const EVENT_ORDER: NewsEvent[] = ['earnings', 'rating', 'supply', 'product', 'deal', 'legal', 'management', 'capital'];

export interface HeadlineReading {
  event: NewsEvent | null;
  direction: NewsDirection | null;
  noise: NewsNoise | null;
  /** the words the tag and the direction were read from */
  words: string[];
}

const rx = (s: string) => new RegExp(s, 'i');

/* ---- what is not news about the company ----------------------------------- */

/** A wealth manager's 13F, written up as an article: "X Buys 1,905 Shares of Apple". */
const HOLDER_FILING = rx(String.raw`\b(shares|stake|position|holdings?|stock)\b.{0,40}\b(acquired|purchased|bought|sold|cut|trimmed|raised|boosted|increased|decreased|lowered|reduced|lifted|grown)\b.{0,6}\bby\b|\b(buys|sells|acquires|purchases|lowers|raises|boosts|trims|cuts|reduces|increases|decreases)\b.{0,30}\b(shares|stake|position|holdings?)\b.{0,6}\b(of|in)\b|\bmakes new .{0,30}investment in\b|\bnew position in\b`);
/** A law firm advertising for plaintiffs. The lawsuit may be real; the headline is an advert. */
const CLASS_ACTION_AD = rx(String.raw`\b(lead plaintiff|encourages .{0,60}investors|urges .{0,60}investors|investors? (who|with) (lost|significant losses|substantial losses)|substantial losses|shareholders who lost|securities (class action|fraud lawsuit)|class action lawsuit seeks|opportunity to lead|may seek to lead|deadline (notice|alert|approaching)|investor (alert|deadline)|contact .{0,40}law|law (firm|offices)|rosen|pomerantz|kessler topaz|bragar eagel|levi & korsinsky|robbins (llp|geller)|kaplan fox|faruqi|glancy|bernstein liebhard|bronstein|schall law|sbs law|awko law|halper sadeh|ademi|monteverde|brodsky|rigrodsky|kahn swick|wohl & fruchter)\b|\b(investigation alert|shareholder alert)\b|\binvestigat(es|ing|ion)\b.{0,20}\bwhether\b.{0,120}\b(fair|fiduciary)\b`);
/** Several companies in one line: whatever it says belongs to someone else as often as not. */
const ROUNDUP = rx(String.raw`^(first look|[a-z]+day'?s first moves|first moves|stock market (today|midday|update)|the big \d|breakfast news|market (wrap|update|movers)|morning (brief|report|movers)|before the bell|what's moving)\b`);
/** Previews, comparisons, listicles and questions: commentary, not something that happened. */
const PREVIEW_OPINION = rx(String.raw`^(will|can|could|should|is|are|does|why (is|are|you|investors)|what makes|how (to|should)|prediction:|if you (had )?invested|here's how much|better .{0,30} stock|which (stock|is)|\d+ (reasons?|stocks?|ways?))\b|\?\s*$|\?\s|\b(should you (buy|sell)|buy, (sell|hold)|buy now|stocks? to buy|top dividend stock|great dividend stock|strong buy stock|solid growth stock|momentum stock|value (option|stock)|vs\.?|what('s| is) in store|ahead of (q[1-4]|its|earnings|november|october)|earnings (coming up|preview|on the deck|loom)|(slated|set|scheduled|due) to report|before q[1-4] earnings|since last earnings report|beat (earnings )?estimates again|earnings surprise streak|poised to beat|could beat|is priced in|could be worth|millionaire|explained|here's what|what you need to know)\b`);
/** The chart, in words: a move with no cause named. */
const PRICE_MOVE = rx(String.raw`\b(stocks?|shares?|\d+(\.\d+)?%)\b.{0,40}\b(falls?|fell|drops?|dropped|dips?|slides?|slid|slips?|sinks?|sank|tumbles?|plunges?|plummets?|crash(es|ed)?|rises?|rose|jumps?|jumped|soars?|soared|surges?|surged|rall(y|ies|ied)|climbs?|gains?|spikes?|slumps?|declines?|edges? (up|down|higher|lower)|is (up|down)|trades? (higher|lower)|registers)\b|^\S+(\s\S+){0,4} (jumps?|soars?|surges?|plunges?|slides?|sinks?|spikes?|tumbles?) \d+(\.\d+)?%|\b(52-week (high|low)|all-time high|worst day|best day|death cross|golden cross|in one week|premarket|midday|today)\b`);

/* ---- the events, in the order they are tried ----------------------------------
   The first event whose pattern matches is the tag. Each pattern needs an
   action, not just a subject: "revenue" alone is commentary ("OpenAI's revenue
   numbers don't add up"); "reports revenue", "earnings beat", "cuts guidance"
   are events. */

const EVENTS: { id: NewsEvent; re: RegExp }[] = [
  { id: 'rating', re: rx(String.raw`\b(upgrades?|upgraded|downgrades?|downgraded|initiates?|initiated|starts? coverage|begins? coverage|resumes? coverage|coverage at|reiterates?|reiterated|price target|target to \$\d|(raises?|lifts?|hikes?|boosts?|cuts?|lowers?|trims?|slashes?) .{0,25}target|rating (upgrade|downgrade|cut|raised|lowered)|moves to (buy|sell|hold)|to (overweight|underweight|outperform|underperform|equal[- ]weight|neutral|buy|sell) from)\b|\$\d[\d,.]*\s?(price )?target\b`) },
  { id: 'earnings', re: rx(String.raw`\b(earnings|eps|revenues?|sales|profits?|results|quarter|q[1-4])\b.{0,40}\b(beats?|miss(es|ed)?|tops?|surpass(es)?|exceeds?|record|rises?|rose|falls?|fell|jumps?|surges?|drops?|declines?|grows?|grew|increases?|quickens?|slows?|slumps?)\b|\b(beats?|miss(es|ed)?|tops?|surpass(es)?|exceeds?|falls? short of|below) .{0,30}\b(estimates|expectations|consensus|forecasts?|views)\b|\b(raises?|lifts?|hikes?|boosts?|cuts?|lowers?|slashes?|trims?|withdraws?|pulls?|reaffirm(s|ed)?|reiterates? .{0,10}|maintains?|issues?|ups)\b.{0,25}\b(guidance|outlook|forecast)\b|\b(guidance|outlook|forecast)\b.{0,10}\b(raised|cut|lowered|slashed|reaffirmed|withdrawn)\b|\b(reports|reported) .{0,60}\b(results|earnings|quarter|revenue|sales)\b|\bprofit warning\b`) },
  { id: 'management', re: rx(String.raw`\b(names .{0,40}\bas (its |new |next )?([\w&-]+ )?(ceo|cfo|coo|chief|president|head|chair)|appoints?|appointed|hires? .{0,30}\bas\b|steps? down|resigns?|resigned|retires? as|to retire|successor|to succeed|new (ceo|cfo|chief executive|chief financial)|(ceo|cfo|chief executive) (exits?|departs?|leaves?|ousted|fired)|ousts?|fires? (its |the )?(ceo|cfo))\b`) },
  { id: 'supply', re: rx(String.raw`\b(supply chain|suppliers?|shortages?|(order|production|output) (cuts?|increases?|halt)|(cuts?|reduces?|trims?|slashes?|raises?|boosts?|increases?) .{0,25}\b(orders|production|output)|component orders|halts? production|capacity (constraints?|shortfall)|supply constrain(ed|ts?)|wait times|can'?t keep up|cannot keep up)\b`) },
  { id: 'deal', re: rx(String.raw`\b(acquires?|acquisition|to acquire|buyout|takeover|merger|merges? with|divest(s|iture|ing)?|approve .{0,30}\bsale\b|spin[- ]?off|spins? off|to sell (its|the)|sale of (its|the)|agrees? to (buy|sell|acquire)|deal to (buy|sell|acquire)|(will|would|plans to|set to) (buy|acquire)(?! back)|bids? for|offer for|m&a)\b`) },
  { id: 'legal', re: rx(String.raw`\b(lawsuit|sues?|sued|suing|class action|settle(s|d|ment)?|antitrust|probe|investigation|investigates|subpoena|fined?|penalty|ruling|court|judge|regulators?|department|commission|agency|sec\b|ftc|doj|fda|approv(al|es|ed)|clearance|recalls?|recalled|ban(s|ned)?|suspends? .{0,30}from|data breach|pushback)\b`) },
  { id: 'capital', re: rx(String.raw`\b(declares?|declared|announces?|approves?|authori[sz]es?|raises?|hikes?|increases?|boosts?|cuts?|suspends?|special)\b.{0,40}\b(dividend|buyback|repurchase|distribution)\b|\b(dividend|buyback|share repurchase) (hike|increase|cut|raise|program|plan|authori[sz]ation)\b`) },
  { id: 'product', re: rx(String.raw`\b(launch(es)?|to launch|unveils?|introduces?|rolls? out|releases? (new|its)|new (product|device|model|feature|chip|service|lineup)|partners? with|partnering with|partnership|teams up|contract|awarded|wins? .{0,20}(deal|order|contract)|orders? \d[\d,]* |signs? .{0,20}(deal|agreement)|agreement with|licensing deal|backlog)\b`) },
];

/* ---- directions: one meaning only, and tied to the event's own subject ---- */

const UP: Partial<Record<NewsEvent, RegExp>> = {
  rating: rx(String.raw`\b(upgrades?|upgraded|rating upgrade|moves to buy|(raises?|lifts?|hikes?|boosts?) .{0,25}target|target (raised|lifted|hiked)|(initiates?|initiated|starts?|begins?) .{0,40}\b(buy|overweight|outperform)|coverage at (buy|overweight|outperform)|to (buy|overweight|outperform) from)\b`),
  earnings: rx(String.raw`\b(beats?|tops?|surpass(es)?|exceeds?) .{0,30}\b(estimates|expectations|consensus|forecasts?|views)\b|\b(earnings|eps|revenues?|sales|profits?|results|q[1-4])\b.{0,25}\b(beats?|tops?|record)\b|\b(raises?|lifts?|hikes?|boosts?|ups)\b.{0,25}\b(guidance|outlook|forecast)\b|\b(guidance|outlook|forecast) (raised|hiked|lifted)\b`),
  supply: rx(String.raw`\b((raises?|boosts?|increases?|lifts?) .{0,20}(orders|production|output)|(order|production|output) increases?)\b`),
  legal: rx(String.raw`\b(fda approv(al|es|ed)|(wins?|receives?|gets?) .{0,20}approval|approves .{0,30}(drug|treatment|therapy|injection|device|merger|deal)|wins? .{0,25}(lawsuit|case|ruling|appeal)|dismiss(es|ed)? .{0,20}(lawsuit|case|suit)|cleared)\b`),
  capital: rx(String.raw`\b(raises?|hikes?|increases?|boosts?) .{0,25}(dividend|buyback|repurchase|payout)|\b(dividend|payout) (hike|increase|raise)|\bspecial dividend|new .{0,20}(buyback|repurchase)|(authori[sz]es?|approves?|announces?) .{0,40}(buyback|repurchase)\b`),
};

const DOWN: Partial<Record<NewsEvent, RegExp>> = {
  rating: rx(String.raw`\b(downgrades?|downgraded|rating (downgrade|cut)|moves to sell|(cuts?|lowers?|trims?|slashes?) .{0,25}target|target (cut|lowered|trimmed)|(initiates?|initiated|starts?|begins?) .{0,40}\b(sell|underweight|underperform)|coverage at (sell|underweight|underperform)|to (sell|underweight|underperform|neutral|hold) from)\b`),
  earnings: rx(String.raw`\b(miss(es|ed)?|falls? short of|below) .{0,30}\b(estimates|expectations|consensus|forecasts?|views)\b|\b(earnings|eps|revenues?|sales|profits?|results|q[1-4])\b.{0,25}\b(miss(es|ed)?)\b|\b(cuts?|lowers?|slashes?|trims?|withdraws?|pulls?)\b.{0,25}\b(guidance|outlook|forecast)\b|\b(guidance|outlook|forecast) (cut|lowered|slashed|withdrawn)\b|\bprofit warning\b`),
  supply: rx(String.raw`\b((cuts?|lowers?|reduces?|slashes?|trims?) .{0,25}(orders|production|output)|(order|production|output) cuts?|shortages?|halts? production)\b`),
  legal: rx(String.raw`\b(recalls?|recalled|fined|charged|indicted|banned from|suspends? .{0,30}from|loses? .{0,25}(lawsuit|case|ruling|appeal))\b`),
  capital: rx(String.raw`\b(cuts?|suspends?|slashes?|eliminates?) .{0,25}(dividend|buyback|repurchase|payout)\b`),
};

/* "no feud", "denies cutting guidance", "won't cut": the direction is the
   opposite or not there at all, and a word list cannot tell which. */
const NEGATED = rx(String.raw`\b(no|not|denies|denied|won't|will not|doesn't|does not|rules out|ruled out|despite)\b`);

/**
 * Read one headline. When several companies share a line separated by ";"
 * ("Fastly spikes as Oppenheimer upgrades; Datadog rises"), only the first
 * clause is read — that is the company the line leads with.
 */
export function readHeadline(title: string): HeadlineReading {
  /* "CTRE Upgraded to Buy: What Does It Mean for the Stock?" — the event is
     before the colon and the question after it is the publisher's template,
     so the template is cut off before anything is read. */
  const full = String(title || '').replace(/\s+/g, ' ').trim()
    .replace(/:\s(here'?s|what|why|how|should|can|is|will|buy|rationale|all you need)\b[^:]*$/i, '');
  const t = full.split(/;\s/)[0];
  const none = (noise: NewsNoise | null): HeadlineReading => ({ event: null, direction: null, noise, words: [] });
  if (!t) return none(null);
  if (HOLDER_FILING.test(t)) return none('holder filing');
  if (CLASS_ACTION_AD.test(full)) return none('class-action notice');
  if (ROUNDUP.test(t)) return none('roundup');
  if (PREVIEW_OPINION.test(full)) return none('preview or opinion');

  for (const { id, re } of EVENTS) {
    const m = t.match(re);
    if (!m) continue;
    const up = UP[id] && t.match(UP[id]!);
    const down = DOWN[id] && t.match(DOWN[id]!);
    // Both ways, or a negator anywhere: the tag stands, the direction does not.
    const clean = !NEGATED.test(t) && !(up && down);
    const direction: NewsDirection | null = clean ? (up ? 'up' : down ? 'down' : null) : null;
    return { event: id, direction, noise: null, words: [m[0], ...(up ? [up[0]] : []), ...(down ? [down[0]] : [])] };
  }
  // A move with no cause named is the chart, not news.
  if (PRICE_MOVE.test(t)) return none('price move');
  return none(null);
}

/* ==========================================================================
   One story, many outlets
   ========================================================================== */

const STOP = new Set('a an the of to in on for and or as at by with from its it is are be this that after amid over into new says said report reports reportedly stock shares inc corp co'.split(' '));
/* The lead clause only — "…order cuts; Skyworks slips" is about the first
   company — and plurals folded, so "order cuts", "order cut" and "cuts
   orders" share their words. */
const fold = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const wordsOf = (t: string) => new Set(t.split(/;\s/)[0].toLowerCase().replace(/[’']s\b/g, '').match(/[a-z0-9$%.]+/g)
  ?.filter((w) => !STOP.has(w) && w.length > 1).map(fold) || []);

function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n += 1;
  return n / Math.min(a.size, b.size);
}

export interface NewsItem { title: string; date: string; source?: string; url?: string | null }

export interface Story<T extends NewsItem = NewsItem> {
  /** the earliest copy: who had it first */
  lead: T;
  copies: T[];
  outlets: string[];
  reading: HeadlineReading;
}

/**
 * Group the copies of one story: the same event tag, within three days, and
 * headlines sharing most of their words. Two different stories about the
 * same event type ("Apple cuts iPhone orders" and "Apple partners with LG")
 * share too few words to merge.
 */
export function groupStories<T extends NewsItem>(items: T[], windowDays = 3, minOverlap = 0.6): Story<T>[] {
  const sorted = items.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const stories: (Story<T> & { _w: Set<string> })[] = [];
  for (const it of sorted) {
    const reading = readHeadline(it.title);
    const w = wordsOf(it.title);
    const t = +new Date(it.date);
    const home = stories.find((s) => s.reading.event === reading.event && s.reading.noise === reading.noise
      && Math.abs(t - +new Date(s.lead.date)) <= windowDays * 864e5 && overlap(w, s._w) >= minOverlap);
    if (home) {
      home.copies.push(it);
      if (it.source && !home.outlets.includes(it.source)) home.outlets.push(it.source);
      // A copy that reads a direction the lead did not keeps the story honest:
      // two copies disagreeing leave it with none.
      if (home.reading.direction !== reading.direction) home.reading = { ...home.reading, direction: null };
    } else {
      stories.push({ lead: it, copies: [it], outlets: it.source ? [it.source] : [], reading, _w: w });
    }
  }
  return stories
    .map(({ _w, ...s }) => s)
    .sort((a, b) => String(b.lead.date).localeCompare(String(a.lead.date)));
}

/** The stories worth a reader's time: tagged with an event, newest first. */
export const eventStories = <T extends NewsItem>(stories: Story<T>[]) => stories.filter((s) => s.reading.event);
