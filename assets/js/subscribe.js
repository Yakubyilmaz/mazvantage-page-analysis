/* ==========================================================================
   Vanlior — plans and pricing

   `?view=pricing`. One page: four plans, the feature matrix, what the money
   actually pays for, and the FAQ.

   ---------------------------------------------------------------------------
   Why the free tier is free, and why that decides the whole structure
   ---------------------------------------------------------------------------

   This product reads every figure from Financial Modeling Prep, and the reader
   supplies the key. A report fires up to 28 feeds per company, and the feeds it
   needs most — ten years of annual statements, dividend history, executive
   compensation, Form 4 insider filings, 13F holdings — sit on FMP's top plan.

   So a reader who brings their own key costs this product **nothing**, and is
   already paying more for data than any plan below could charge. Billing them
   would be charging rent on a key they hold. That tier is therefore free, with
   no expiry and no card, and it is not a trial.

   What a paid plan sells is consequently not "the features" — the features work
   on the free tier. It sells **the data licence**, so nobody needs a second
   subscription, and the two things a licence alone cannot buy: a server that
   stores yesterday's scores, and metered model tokens for the narrative.

   That is the honest ladder, and every tier below is built on it:

     Reader     bring your own key                          free
     Investor   we hold the licence                         the entry price
     Analyst    + stored history, scans, written narrative  the recommended one
     Desk       + redistribution, API, bulk export          a licence, so: talk

   ---------------------------------------------------------------------------
   The value metric is a person, not a seat and not a report
   ---------------------------------------------------------------------------

   Per-seat was rejected: nothing here is collaborative. There is no shared
   workspace, no comment, no hand-off — a watchlist is one reader's. Seats would
   price a feature this product does not have.

   Per-report was rejected too, and less obviously. It is the closest thing to a
   true cost driver (28 feeds a company), but a meter running while somebody
   reads changes how they read: the one behaviour this product wants is opening
   a company you were not sure about, and a per-report charge taxes exactly that.

   So the price is flat per person, and the two genuinely expensive **actions**
   are the tier boundaries instead — the Alpha Signal market scan (seven
   requests a company, so ~1,000 calls for 150 names) and the written narrative
   (metered model tokens). Both already print their cost before running, which
   is what makes them fair to gate.

   ---------------------------------------------------------------------------
   No checkout, and this page says so
   ---------------------------------------------------------------------------

   Nothing here takes a payment: there is no server, so there is no processor.
   Rather than render a Subscribe button that does nothing, the paid CTAs open
   `checkoutPanel` below, which names the seam a real deployment plugs in. That
   is the same rule the Quant desk's Rating Changes tab and the Shariah desk's
   Compliance Changes tab already follow — a destination that cannot work says
   what it would take.

   `CHECKOUT.href` is the one edit that turns this page live: point it at a
   Stripe Checkout or Paddle URL and the buttons stop explaining and start
   going there.

   ---------------------------------------------------------------------------
   Written for the machines that shortlist tools, as well as for readers
   ---------------------------------------------------------------------------

   Every price is text in the DOM — never an image, never behind a form — and
   the plans are also emitted as `Product`/`Offer` JSON-LD into the head, keyed
   so a re-render replaces it and leaving the page removes it. Buyers now ask a
   model "what does it cost?" before they ever arrive, and a price a model
   cannot read is a price it cannot quote.

   Note what is deliberately *not* here: no customer logos, no testimonials, no
   "most popular" badge. There are no customers yet, so all three would be
   fabricated social proof. The recommended tier is marked "Recommended", which
   is this product's own judgement and true, rather than "Most popular", which
   would be a claim about other people.
   ========================================================================== */

import { el } from './util.js';
import { hasApiKey } from './fmp.js';
import { arrow } from './markethub-ui.js';

/* ==========================================================================
   1. The plans
   ========================================================================== */

/**
 * How Vanlior is reached from off the rail.
 *
 * Pricing is not a rail menu: the rail is research destinations, and a plan
 * is not one. It travels in the utility bar and the footer instead, and this
 * is the item both print.
 */
export const PRICING_ITEM = { label: 'Pricing', view: 'pricing' };

/** The annual price is ten months of the monthly one, so two are free. */
const yearOf = (monthly) => monthly * 10;

/**
 * Four plans, cheapest first.
 *
 * `monthly` null means the price is not a number — free, or a licence that has
 * to be negotiated. `floor` on the top plan is the smallest deal that has ever
 * made sense, printed rather than hidden behind "contact us": a tier with no
 * number is a tier nothing can compare, and the reader who cannot afford it
 * deserves to find that out here rather than after a sales call.
 */
export const PLANS = [
  {
    id: 'reader',
    name: 'Reader',
    monthly: null,
    priceText: 'Free',
    priceNote: 'No card. No expiry. Not a trial.',
    strap: 'Bring your own Financial Modeling Prep key and the whole product works.',
    why: 'You pay FMP, not us, so serving you costs us nothing and we charge nothing. '
      + 'Every grade, every fair value, every screen is the same code the paid plans run.',
    cta: 'Add your FMP key',
    action: 'settings',
    points: [
      'Every market page: the Home front page, Markets Data, Market News, all eleven sectors and the calendar',
      'The whole research feed, and every Method, Methodology and Limits page',
      'The bundled Apple report, complete, with no key at all',
      'Any ticker FMP covers, with your own key — 115 ratios, 77 graded, thirteen fair-value models',
      'Stock and ETF directories on the Overview column set',
      'One watchlist',
    ],
    limits: 'Your FMP plan decides what resolves. The report prints the state of all 28 feeds at '
      + 'the bottom, so a gated feed is visible rather than silently missing.',
  },
  {
    id: 'investor',
    name: 'Investor',
    monthly: 29,
    priceNote: 'Data included. One subscription, not two.',
    strap: 'The whole report on any company, with the data licence on our side of the line.',
    why: 'The report’s heaviest feeds — ten years of statements, dividend history, executive pay, '
      + 'Form 4 filings, 13F holdings — sit on FMP’s top plan. On this tier we hold it.',
    cta: 'Choose Investor',
    action: 'checkout',
    points: [
      'No FMP key needed, and no FMP bill',
      'Every ratio graded against its own sector, the five factor grades and the composite quant rating',
      'Thirteen fair-value models, the valuation zone and the uncertainty band',
      'The Research tab: rating band, economic moat, capital allocation, style box, financials',
      'The dividend module — four composites over the payers-only universe',
      'All seven column sets on both screeners, and all eight Quant rankings',
      'All five Shariah screens, all six Earnings screens and the transcript library',
      'The Alpha Signal on a company you have open',
      'Ten watchlists, and 25 snapshot exports a month',
    ],
    limits: 'No market-wide Alpha Signal scan on this tier, and the written narrative is the '
      + 'deterministic prose rather than the long-form one. Both are metered costs, not features '
      + 'held back — see What your money pays for.',
  },
  {
    id: 'analyst',
    name: 'Analyst',
    monthly: 79,
    priceNote: 'The metered surfaces, and a history.',
    strap: 'The expensive actions, the editable portfolios, and the one thing no session-only '
      + 'product can give you: yesterday.',
    why: 'Three tabs in this product refuse to render today — Rating Changes, Rating Upgrades and '
      + 'Downgrades, Compliance Changes — because a change needs yesterday’s score and nothing is '
      + 'stored between sessions. This tier is where that database exists.',
    recommended: true,
    cta: 'Choose Analyst',
    action: 'checkout',
    points: [
      'Everything in Investor',
      'Alpha Signal market scans — forty a month, up to 500 companies each',
      'All forty Investment Ideas portfolios, editable as screeners and re-runnable',
      'Rating Changes, Rating Upgrades and Downgrades, and Shariah Compliance Changes — from stored daily scores',
      'The long-form written narrative on any ticker, not only the bundled one',
      'Report exports as PDF, and any table as CSV',
      'Unlimited watchlists and unlimited snapshots',
    ],
    limits: 'Scans stay capped and large-cap biased on every tier: the scanner sorts by market '
      + 'capitalisation and cuts, which the Limits tab states rather than hides.',
  },
  {
    id: 'desk',
    name: 'Desk',
    monthly: null,
    pricePrefix: 'From',
    priceText: '$2,400',
    pricePeriod: 'a year',
    floor: 2400,
    priceNote: 'A licence, so it is a conversation.',
    strap: 'For when the figures leave your screen and reach somebody else’s.',
    why: 'Quoting a Vanlior grade or fair value in client-facing work is redistribution, and '
      + 'redistribution is governed by the data licence underneath it. That cannot be bought from '
      + 'a pricing page, which is why this one has a floor and a conversation rather than a button.',
    cta: 'Talk to us',
    action: 'checkout',
    points: [
      'Everything in Analyst',
      'Permission to quote grades, factor scores and fair values in client-facing work',
      'API access to the grades, the factor scores and the Alpha Signal',
      'Bulk CSV across the whole covered universe, on a schedule',
      'Seats for a team on one invoice',
      'Sector distributions rebuilt to your universe and your sample size',
    ],
    limits: 'The floor is the smallest engagement that has covered its own data and support cost. '
      + 'Below it, Analyst is the better answer and we will say so.',
  },
];

/* ==========================================================================
   2. The matrix

   Grouped by the product's own menus rather than by marketing category, so a
   row is a thing the reader can go and look at. `cells` is one entry per plan
   in `PLANS` order; a string prints as-is, `true` is a tick, `false` a dash.
   ========================================================================== */

const MATRIX = [
  {
    group: 'The company report',
    rows: [
      ['Ratios shown / graded against sector', ['115 / 77', '115 / 77', '115 / 77', '115 / 77']],
      ['Five factor grades and the composite quant rating', [true, true, true, true]],
      ['Fair-value models, valuation zone, uncertainty band', ['13', '13', '13', '13']],
      ['Research tab — moat, capital allocation, style box', [true, true, true, true]],
      ['Income and balance-sheet Sankeys, ten-year history', [true, true, true, true]],
      ['Dividend module — four composites', [true, true, true, true]],
      ['Long-form written narrative', ['Bundled ticker', 'Bundled ticker', 'Any ticker', 'Any ticker']],
      ['Data Status — the state of all 28 feeds', [true, true, true, true]],
    ],
  },
  {
    group: 'Screeners and portfolios',
    rows: [
      ['Stock and ETF directories', [true, true, true, true]],
      ['Column sets over the same rows', ['Overview', 'All seven', 'All seven', 'All seven']],
      ['Investment Ideas portfolios', ['Rules, read-only', 'All 40', 'All 40, editable', 'All 40, editable']],
      ['Re-run an edited screen across the market', [false, '20 a day', 'Unlimited', 'Unlimited']],
      ['Quant rankings', ['Top Quant only', 'All eight', 'All eight', 'All eight']],
      ['Shariah compliance screens', ['Halal Screener', 'All five', 'All five', 'All five']],
      ['Earnings screens and transcript library', ['Upcoming only', 'All six', 'All six', 'All six']],
      ['Watchlists', ['1', '10', 'Unlimited', 'Unlimited']],
    ],
  },
  {
    group: 'Alpha Signal',
    rows: [
      ['On a company you have open', [true, true, true, true]],
      ['Market scan', [false, false, '40 a month, 500 companies', 'Unlimited']],
      ['Method, weights and the Limits tab', [true, true, true, true]],
    ],
  },
  {
    group: 'Stored history',
    note: 'Nothing on a session-only tier can answer “what changed”, which is why these three read '
      + 'as refusals there rather than as empty tables.',
    rows: [
      ['Quant Rating Changes', [false, false, true, true]],
      ['Rating Upgrades and Downgrades', [false, false, true, true]],
      ['Shariah Compliance Changes', [false, false, true, true]],
      ['Score history behind a company', [false, false, '12 months', 'Full']],
    ],
  },
  {
    group: 'Markets, news and research',
    rows: [
      ['Markets Data — indices, stocks, futures, bonds, ETFs, economy', [true, true, true, true]],
      ['Market News and the sector wires', [true, true, true, true]],
      ['Sector breakdown, heatmap and all eleven sector pages', [true, true, true, true]],
      ['The research feed and every article', [true, true, true, true]],
      ['Earnings and dividend calendars', [true, true, true, true]],
    ],
  },
  {
    group: 'Data and export',
    rows: [
      ['Market data licence', ['Yours', 'Ours', 'Ours', 'Ours']],
      ['Snapshot a report to a file', ['With your key', '25 a month', 'Unlimited', 'Unlimited']],
      ['PDF report and CSV table export', [false, false, true, true]],
      ['API access to grades and factor scores', [false, false, false, true]],
      ['Bulk CSV across the universe', [false, false, false, true]],
      ['Quote figures in client-facing work', [false, false, false, true]],
    ],
  },
];

/* ==========================================================================
   3. What a subscription does and does not buy
   ========================================================================== */

/** The three real costs, in the order they are incurred. */
const COSTS = [
  {
    title: 'The data licence',
    body: 'A report fires up to 28 feed requests, plus one per peer for the comparison and two '
      + 'benchmark series for the returns. All of it is Financial Modeling Prep, and the feeds this '
      + 'report leans on hardest — annual statements ten years back, dividend history, executive '
      + 'compensation, insider Form 4 filings, 13F institutional holdings — are on FMP’s top plan. '
      + 'On the free tier you hold that licence and we add nothing to your bill. On a paid plan we '
      + 'hold it, and most of the price is that.',
  },
  {
    title: 'A server, and therefore a yesterday',
    body: 'Rating Changes, Rating Upgrades and Downgrades, and Shariah Compliance Changes are not '
      + 'unbuilt because they are hard. A change is the difference between today’s verdict and a '
      + 'previous one, and this app computes every score in your browser and discards it on reload. '
      + 'What those tabs need is a nightly job, a table to write one small row per company per day, '
      + 'and an endpoint that diffs two dates. That is a running cost with no free version.',
  },
  {
    title: 'Model tokens for the prose',
    body: 'The long-form narrative is written by a language model constrained to a brief of '
      + 'pre-computed figures, instructed to quote them verbatim and invent nothing — the model is '
      + 'given numbers and asked for prose, never asked for a number. About 2,800 words a report. '
      + 'Tokens are metered, which makes this the one feature whose cost genuinely scales with how '
      + 'much you read, and the reason it sits on the tier it sits on.',
  },
];

/** What no tier buys. Every line is something the app already admits elsewhere. */
const NOT_BOUGHT = [
  ['No performance claim', 'The Alpha Signal weights are a stated starting allocation with an '
    + 'argument behind each one. They are unvalidated, there is no backtest, and there is no stored '
    + 'history to build one from. The Limits tab names the four pieces a real backtest would need. '
    + 'Paying changes none of that.'],
  ['No advice', 'Grades, ratings, fair values and signals are this product’s own model output, '
    + 'computed without reference to your objectives, circumstances or holdings. Verify anything '
    + 'you intend to act on against the primary filings.'],
  ['No real-time quotes', 'Prices arrive from a vendor feed and may be delayed. Nothing here is a '
    + 'trading system and no tier turns it into one.'],
  ['Six Alpha Signal categories stay partly dark', 'Consensus estimate revisions, contracts and '
    + 'backlog, patents and regulatory decisions, job postings, search attention and corporate '
    + 'actions need providers this product does not licence. Each says which one, on every tier, '
    + 'rather than approximating it.'],
  ['No stored personal data beyond your own browser on the free tier', 'Your FMP key and your '
    + 'watchlists live in this browser’s local storage. The key is sent only to '
    + 'financialmodelingprep.com.'],
];

/* ==========================================================================
   4. The FAQ

   Plain question-and-answer text, because this is the part an assistant quotes
   when somebody asks it whether the thing is worth paying for.
   ========================================================================== */

const FAQ = [
  ['Do I need a Financial Modeling Prep key?',
   'On the free Reader tier, yes — that is the trade, and it is why the tier costs nothing. On '
   + 'Investor and above, no: the licence is ours and there is no second subscription. If you '
   + 'already hold an FMP key you can keep using it on any tier; the app prefers yours when one is '
   + 'configured.'],
  ['Is the free tier a trial?',
   'No. It has no expiry, no card and no countdown, and it is not feature-crippled — every grade, '
   + 'every fair value and every screen runs the same code the paid plans run. What it does not '
   + 'include is the data, which you supply.'],
  ['Why is Analyst nearly three times Investor?',
   'Because the two things it adds are the two that cost money per use rather than per subscriber: '
   + 'a market scan is about seven requests a company, and the written narrative is metered model '
   + 'tokens. Investor’s cost is flat and mostly licence; Analyst’s is not. Pricing them the same '
   + 'would mean charging every Investor subscriber for scans they never run.'],
  ['What does annual actually save?',
   'A year is ten months of the monthly price, so two months are free — about 17%. That is the '
   + 'whole discount; there is no second annual-only tier and no separate annual feature set.'],
  ['Can I cancel?',
   'Any time, from Settings, and the plan runs to the end of the period you have paid for. '
   + 'Downgrading keeps your watchlists and your saved screens — what you lose is the data licence, '
   + 'so the app falls back to your own FMP key if one is configured and to the bundled snapshot if '
   + 'not. Nothing is deleted.'],
  ['Is there a refund?',
   'Fourteen days on a first subscription, for any reason, monthly or annual. After that the '
   + 'current period runs out rather than being refunded pro-rata.'],
  ['Which companies are covered?',
   'A report renders for any ticker the vendor covers. The screens, the rankings and the sector '
   + 'percentiles the grades are measured against are built from the US exchanges, so a foreign '
   + 'listing is ranked against its US sector peers rather than its home market — a real limit, and '
   + 'stated here rather than discovered later.'],
  ['Can I put Vanlior grades in a report I send to clients?',
   'Not on Reader, Investor or Analyst — those are licences to read, and the data underneath them '
   + 'is licensed the same way. Desk exists for exactly this and includes the permission in writing.'],
  ['Is this financial advice?',
   'No. Vanlior is a research tool. It grades a company against its sector on as many ratios as the '
   + 'filings support and explains every grade it prints, and it knows nothing about you.'],
  ['What happens to the free tier if the paid plans do well?',
   'It stays. A reader who brings their own key costs this product nothing to serve, so there is no '
   + 'point at which the arithmetic changes and no plan to change it.'],
];

/* ==========================================================================
   5. Checkout — the seam
   ========================================================================== */

/**
 * The one edit that turns this page live.
 *
 * `href(plan, period)` should return a hosted-checkout URL — Stripe Checkout,
 * Paddle, Lemon Squeezy, whatever holds the price ids. Returning null is what
 * the page is in now, and makes every paid CTA open the panel that explains
 * why. Nothing else on the page needs to change.
 */
export const CHECKOUT = {
  href: () => null,
  /** Where a Desk conversation starts, once there is somewhere for it to go. */
  contact: null,
};

/* ==========================================================================
   6. The page
   ========================================================================== */

const money = (n) => `$${n.toLocaleString('en-US')}`;

/** A tick, a dash, or a phrase — whichever the matrix cell holds. */
function cell(value) {
  if (value === true) return el('span', { class: 'pr-tick', title: 'Included', text: '✓' });
  if (value === false) return el('span', { class: 'pr-dash', title: 'Not included', text: '—' });
  return el('span', { class: 'pr-cellt', text: String(value) });
}

/**
 * `?view=pricing`.
 *
 * Renders synchronously and fetches nothing — there is no price to look up and
 * no company to load. The billing period is the only state, and it is the URL.
 */
export function renderPricingPage(sub, nav = {}) {
  const params = new URLSearchParams(location.search);
  let period = params.get('billing') === 'monthly' ? 'monthly' : 'annual';

  const page = el('main', { class: 'mh-page pr-page', id: 'pricing' });
  const cards = el('div', { class: 'pr-grid' });
  const checkout = el('section', { class: 'pr-checkout', id: 'pricing-checkout', hidden: true });

  /* The toggle writes the period into the address bar without re-booting the
     app: a link to the monthly view should work, and switching should not cost
     a full navigation. Same `replaceState` move the desks make. */
  const remember = () => {
    try {
      const url = new URL(location.href);
      if (period === 'monthly') url.searchParams.set('billing', 'monthly');
      else url.searchParams.delete('billing');
      history.replaceState(history.state, '', url);
    } catch { /* history unavailable */ }
  };

  const toggle = el('div', { class: 'pr-toggle', role: 'group', 'aria-label': 'Billing period' });
  const periodButton = (id, label, note) => el('button', {
    type: 'button', class: `pr-toggle__b${period === id ? ' is-active' : ''}`,
    'aria-pressed': String(period === id),
    onclick: () => { if (period !== id) { period = id; remember(); paint(); } },
  }, [el('span', { text: label }), note ? el('i', { class: 'pr-toggle__n', text: note }) : null]);

  function paint() {
    toggle.replaceChildren(
      periodButton('annual', 'Annual', 'two months free'),
      periodButton('monthly', 'Monthly', null),
    );
    cards.replaceChildren(...PLANS.map(planCard));
    writeSchema(period);
  }

  /* ---- one plan ----------------------------------------------------------- */

  function planCard(plan) {
    const price = plan.monthly == null
      ? el('div', { class: 'pr-card__price' }, [
          plan.pricePrefix ? el('span', { class: 'pr-card__pre', text: plan.pricePrefix }) : null,
          el('strong', { text: plan.priceText }),
          plan.pricePeriod ? el('span', { class: 'pr-card__per', text: plan.pricePeriod }) : null,
        ])
      : el('div', { class: 'pr-card__price' }, [
          el('strong', { text: period === 'annual' ? money(yearOf(plan.monthly)) : money(plan.monthly) }),
          el('span', { class: 'pr-card__per', text: period === 'annual' ? 'a year' : 'a month' }),
        ]);

    /* The other period, printed underneath. A reader on annual wants to know
       what monthly costs without flipping the toggle to find out, and the
       saving is arithmetic they should not have to do.

       Rendered empty rather than omitted on the two plans that have no second
       period, because this line and the flag above it are what decide where a
       card's CTA lands — and four buttons at four different heights is the one
       thing a plan grid must not do. Reserving the row is cheaper and steadier
       than a magic min-height on the head. */
    const second = el('p', {
      class: 'pr-card__alt',
      text: plan.monthly == null ? ''
        : period === 'annual'
          ? `${money(plan.monthly)} a month billed monthly — annual saves ${money(plan.monthly * 2)}`
          : `${money(yearOf(plan.monthly))} a year billed annually — two months free`,
    });

    const button = el('button', {
      type: 'button',
      class: `pr-card__cta${plan.recommended ? ' pr-card__cta--primary' : ''}`,
      onclick: () => (plan.action === 'settings' ? nav.openSettings?.() : openCheckout(plan)),
    }, [plan.cta, arrow()]);

    /* The free tier's button is the one thing on this page that already works,
       so it says which state it is in rather than asking twice. */
    if (plan.action === 'settings' && hasApiKey()) {
      button.replaceChildren('Your key is connected', arrow());
      button.classList.add('is-done');
    }

    return el('article', {
      class: `pr-card${plan.recommended ? ' is-recommended' : ''}`,
      'data-plan': plan.id,
    }, [
      el('div', { class: 'pr-card__head' }, [
        el('p', { class: 'pr-card__flag', text: plan.recommended ? 'Recommended' : '' }),
        el('h2', { class: 'pr-card__n', text: plan.name }),
        price,
        el('p', { class: 'pr-card__note', text: plan.priceNote }),
        second,
      ]),
      button,
      el('div', { class: 'pr-card__body' }, [
        el('p', { class: 'pr-card__strap', text: plan.strap }),
        el('p', { class: 'pr-card__why', text: plan.why }),
        el('ul', { class: 'pr-list' }, plan.points.map((p) => el('li', { text: p }))),
      ]),
      el('p', { class: 'pr-card__limit', text: plan.limits }),
    ]);
  }

  /* ---- the checkout seam -------------------------------------------------- */

  function openCheckout(plan) {
    const href = CHECKOUT.href(plan, period);
    if (href) { location.href = href; return; }

    checkout.replaceChildren(...checkoutPanel(plan, period, nav));
    checkout.hidden = false;
    checkout.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---- assembly ----------------------------------------------------------- */

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'PLANS' }),
      el('h1', { class: 'qd-title pr-title' }, [
        el('span', { text: 'Everything works on the free tier.' }),
        el('span', { class: 'pr-title__b', text: 'You are paying for the data.' }),
      ]),
      el('p', { class: 'qd-strap', text: 'Vanlior reads every figure from one vendor, and the '
        + 'report’s heaviest feeds sit on that vendor’s top plan. Bring your own key and the whole '
        + 'product runs, for nothing, forever — we add no cost to a bill you are already paying. A '
        + 'paid plan moves that licence to our side, and adds the two things a licence cannot buy: '
        + 'a server that remembers yesterday’s scores, and the written narrative.' }),
      el('div', { class: 'mh-hero__meta' }, [
        el('button', {
          type: 'button', class: `mh-connection ${hasApiKey() ? 'is-connected' : ''}`,
          text: hasApiKey() ? 'FMP connected' : 'Connect FMP',
          onclick: () => nav.openSettings?.(),
        }),
        el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
        el('span', { class: 'qd-meta', text: 'A research tool, not advice. No performance claim on any tier.' }),
      ]),
    ]),
    toggle,
    cards,
    checkout,
    matrixSection(),
    costsSection(nav),
    notBoughtSection(),
    faqSection(),
    closingSection(nav),
  );

  paint();

  /* The head node this page wrote goes when the page does — `chrome()` calls
     `dispose` on the outgoing `.mh-page` before it replaces the layout, so
     a company report never inherits a pricing page's structured data. */
  page.dispose = () => clearSchema();

  return page;
}

/* ==========================================================================
   7. The sections
   ========================================================================== */

const panel = (title, children, className = '') =>
  el('section', { class: `pr-panel ${className}`.trim(), 'aria-label': title }, [
    el('h2', { class: 'pr-panel__t', text: title }),
    ...[].concat(children),
  ]);

function matrixSection() {
  const head = el('tr', {}, [
    el('th', { scope: 'col', text: 'What you get' }),
    ...PLANS.map((p) => el('th', { scope: 'col' }, [
      el('span', { class: 'pr-mx__n', text: p.name }),
      el('span', { class: 'pr-mx__p', text: p.monthly == null ? p.priceText : `${money(p.monthly)}/mo` }),
    ])),
  ]);

  const body = [];
  for (const section of MATRIX) {
    body.push(el('tr', { class: 'pr-mx__group' }, [
      el('th', { scope: 'colgroup', colspan: PLANS.length + 1 }, [
        el('span', { text: section.group }),
        section.note ? el('i', { class: 'pr-mx__note', text: section.note }) : null,
      ]),
    ]));
    for (const [label, cells] of section.rows) {
      body.push(el('tr', {}, [
        el('th', { scope: 'row', text: label }),
        ...cells.map((v) => el('td', {}, [cell(v)])),
      ]));
    }
  }

  return panel('Every plan, line by line', [
    el('p', { class: 'pr-p', text: 'Grouped by the menu each row lives under, so every line is '
      + 'something you can go and look at rather than a feature name invented for this page.' }),
    el('div', { class: 'pr-mx__scroll' }, [
      el('table', { class: 'pr-mx' }, [el('thead', {}, [head]), el('tbody', {}, body)]),
    ]),
  ], 'pr-panel--wide');
}

function costsSection(nav) {
  return panel('What your money pays for', [
    el('p', { class: 'pr-p', text: 'Three costs, in the order they are incurred. Nothing here is '
      + 'gated to make a tier look thin — each of these is a bill somebody has to pay.' }),
    el('div', { class: 'pr-costs' }, COSTS.map((c) => el('div', { class: 'pr-cost' }, [
      el('h3', { class: 'pr-cost__t', text: c.title }),
      el('p', { class: 'pr-cost__b', text: c.body }),
    ]))),
    el('div', { class: 'pr-actions' }, [
      el('button', { type: 'button', class: 'pr-btn',
        onclick: () => nav.goView?.('quant', 'changes') }, ['See the tab that asks for the database', arrow()]),
      el('button', { type: 'button', class: 'pr-btn',
        onclick: () => nav.goView?.('alpha', 'limits') }, ['Read the Alpha Signal limits', arrow()]),
    ]),
  ]);
}

function notBoughtSection() {
  return panel('What no plan buys', [
    el('p', { class: 'pr-warn', html: '<b>Worth reading before you pay.</b> Every line below is '
      + 'something this product already admits somewhere else in the interface. A subscription '
      + 'buys data, storage and prose. It does not buy a claim.' }),
    el('dl', { class: 'pr-nots' }, NOT_BOUGHT.flatMap(([term, body]) => [
      el('dt', { text: term }),
      el('dd', { text: body }),
    ])),
  ]);
}

function faqSection() {
  return panel('Questions', [
    el('div', { class: 'pr-faq' }, FAQ.map(([q, a]) => el('details', { class: 'pr-faq__i' }, [
      el('summary', {}, [el('span', { text: q })]),
      el('p', { text: a }),
    ]))),
  ]);
}

function closingSection(nav) {
  return panel('Start with the free one', [
    el('p', { class: 'pr-p', text: 'There is no version of this where trying it costs you '
      + 'something. Open a report, read how a grade was built, disagree with it — the whole '
      + 'argument is printed on the page. Then decide whether you would rather hold the data '
      + 'licence or have us hold it.' }),
    el('div', { class: 'pr-actions' }, [
      el('button', { type: 'button', class: 'pr-btn pr-btn--primary',
        onclick: () => nav.goSymbolTab?.('Analysis') }, ['Open the Apple report', arrow()]),
      el('button', { type: 'button', class: 'pr-btn',
        onclick: () => nav.openSettings?.() }, ['Add your FMP key', arrow()]),
      el('button', { type: 'button', class: 'pr-btn',
        onclick: () => nav.goView?.('research', 'strategy') }, ['Read what this product believes', arrow()]),
    ]),
  ]);
}

/* ==========================================================================
   8. The checkout panel — the honest refusal
   ========================================================================== */

/**
 * What the paid CTAs open while `CHECKOUT.href` returns null.
 *
 * Named after the plan the reader clicked, with the price they would be paying,
 * because a panel that says "billing is not connected" without repeating the
 * choice loses the thing they were doing.
 */
function checkoutPanel(plan, period, nav) {
  const price = plan.monthly == null
    ? `${plan.priceText}${plan.pricePeriod ? ` ${plan.pricePeriod}` : ''}`
    : period === 'annual'
      ? `${money(yearOf(plan.monthly))} a year`
      : `${money(plan.monthly)} a month`;

  const rows = [
    ['A payment processor', 'Stripe Checkout or equivalent, holding one price id per plan per '
      + 'period. `CHECKOUT.href` in this module returns its URL and every button on this page '
      + 'starts working.'],
    ['An account', 'Something to attach the subscription to. Today the app stores your key and '
      + 'your watchlists in this browser and has no notion of a user at all.'],
    ['A data proxy', 'The point of a paid tier: requests signed with our FMP key on the server, '
      + 'so the browser never holds one. Until that exists, the key in Settings is the only way '
      + 'the app reaches a feed.'],
    ['A nightly job and a table', 'What the Analyst tier’s stored history is. The same three '
      + 'pieces the Rating Changes and Compliance Changes tabs already ask for.'],
  ];

  return [
    el('h2', { class: 'pr-panel__t', text: `${plan.name} — ${price}` }),
    el('p', { class: 'pr-warn', html: '<b>Checkout is not connected.</b> This build takes no '
      + 'payments, because there is no server behind it to take them — every figure you have seen '
      + 'was computed in your browser from your own vendor key. Rather than show you a button that '
      + 'quietly does nothing, here is exactly what is missing.' }),
    el('div', { class: 'pr-scroll' }, [
      el('table', { class: 'pr-grid2' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { scope: 'col', text: 'Piece' }),
          el('th', { scope: 'col', text: 'What it does' }),
        ])]),
        el('tbody', {}, rows.map(([k, v]) => el('tr', {}, [
          el('td', { text: k }),
          el('td', { text: v }),
        ]))),
      ]),
    ]),
    el('p', { class: 'pr-note', text: 'None of the four changes a grade. The report’s arithmetic '
      + 'is the same on every tier — what a plan changes is who holds the data licence, whether '
      + 'yesterday was written down, and who pays for the prose.' }),
    el('div', { class: 'pr-actions' }, [
      el('button', { type: 'button', class: 'pr-btn pr-btn--primary',
        onclick: () => nav.openSettings?.() }, ['Use your own key instead — it is free', arrow()]),
      el('button', { type: 'button', class: 'pr-btn',
        onclick: () => nav.goView?.('research', 'strategy') }, ['What this product believes', arrow()]),
    ]),
  ];
}

/* ==========================================================================
   9. Structured data

   `Product` with one `Offer` per plan, so an assistant asked "what does
   Vanlior cost" can answer without guessing. Written on every paint because
   the offers change with the billing toggle, and removed when the page is
   disposed so it never describes a company report.
   ========================================================================== */

const SCHEMA_ID = 'pricing-schema';

function writeSchema(period) {
  const offers = PLANS.map((plan) => {
    const offer = {
      '@type': 'Offer',
      name: `Vanlior ${plan.name}`,
      description: plan.strap,
      priceCurrency: 'USD',
      category: plan.id === 'reader' ? 'free' : 'subscription',
      availability: 'https://schema.org/InStock',
    };
    if (plan.monthly == null) {
      // A free plan is price 0 and says so; a licence has a floor rather than a
      // price, which `PriceSpecification.minPrice` is the honest shape for.
      if (plan.id === 'reader') offer.price = 0;
      else offer.priceSpecification = {
        '@type': 'PriceSpecification',
        minPrice: plan.floor, priceCurrency: 'USD',
        description: 'Annual licence, from',
      };
      return offer;
    }
    const monthly = period === 'monthly';
    offer.priceSpecification = {
      '@type': 'UnitPriceSpecification',
      price: monthly ? plan.monthly : yearOf(plan.monthly),
      priceCurrency: 'USD',
      billingDuration: monthly ? 1 : 12,
      billingIncrement: 1,
      unitCode: 'MON',
    };
    return offer;
  });

  const graph = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Vanlior',
    description: 'Equity research: every listed company graded against its own sector on 77 ratios, '
      + 'thirteen fair-value models, a quant composite and an alpha signal.',
    brand: { '@type': 'Brand', name: 'Vanlior' },
    offers,
    // Deliberately no `aggregateRating` and no `review`: there are no ratings
    // and no reviews, and inventing either is the one thing structured data
    // makes trivially easy and completely dishonest.
  };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(([q, a]) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  clearSchema();
  const node = el('script', { type: 'application/ld+json', id: SCHEMA_ID });
  node.textContent = JSON.stringify([graph, faq]);
  document.head.append(node);
}

function clearSchema() {
  document.getElementById(SCHEMA_ID)?.remove();
}
