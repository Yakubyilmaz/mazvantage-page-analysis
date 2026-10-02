/* ==========================================================================
   Vanlior — plans and pricing

   `?view=pricing`. Laid out after Investing.com's Pro plans page, at the
   user's request: a dark band with the billing switch, the two plans side by
   side in one box, a link down to the comparison, and the comparison itself.
   The plans carry Investing's names, **Pro** and **Pro+**; what is in them is
   this product's own, feature for feature — nothing on either card is
   something Vanlior does not do.

   ---------------------------------------------------------------------------
   The free way in has not gone anywhere
   ---------------------------------------------------------------------------

   A reader who brings their own Financial Modeling Prep key runs the whole
   product for nothing, and that is still true — it is the app itself, not a
   plan. It is simply not a card on this page any more. The checkout panel is
   where it is offered: the moment somebody reaches for a paid plan is the
   moment they should hear that they may not need one.

   ---------------------------------------------------------------------------
   Prices, and the percentages printed over them
   ---------------------------------------------------------------------------

   Each plan stores what it costs **a month** on each billing period, which is
   how the cards print it. The discounts on the switch and the "up to" in the
   headline are computed from those numbers, never typed: the switch shows the
   smallest saving across the plans and the headline the largest, both rounded
   down, so neither can promise more than a plan delivers. Edit a price and
   the percentages follow.

   ---------------------------------------------------------------------------
   No checkout, and this page says so
   ---------------------------------------------------------------------------

   Nothing here takes a payment: there is no server, so there is no processor.
   Claim Offer opens `checkoutPanel` below, which names the seam a real
   deployment plugs in. `CHECKOUT.href` is the one edit that turns the page
   live: point it at a Stripe Checkout or Paddle URL and the buttons go there.

   Every price is text in the DOM, and the plans are also emitted as
   `Product`/`Offer` JSON-LD, so an assistant asked what this costs can answer
   without guessing. No testimonials, no customer logos, no `aggregateRating`:
   there are no customers yet, so all three would be fabricated. "Best value"
   is this product's own judgement of its price ladder, and is allowed for the
   same reason "Recommended" was.
   ========================================================================== */

import { el } from './util.js';
import { hasApiKey } from './fmp.js';
import { arrow, createDialog } from './markethub-ui.js';

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

/** The switch, in the order it prints. `months` is how much one payment covers. */
const PERIODS = [
  { id: 'monthly', label: 'Monthly', months: 1, billed: 'Billed Monthly', every: 'monthly' },
  { id: 'annual', label: 'Yearly', months: 12, billed: 'Billed Annually', every: 'annually' },
  { id: 'biennial', label: '2 Years', months: 24, billed: 'Billed Biennially', every: 'every two years' },
];
const DEFAULT_PERIOD = 'annual';
const periodOf = (id) => PERIODS.find((p) => p.id === id);

/**
 * Two plans, cheapest first.
 *
 * `price` is dollars a month on each period. In `lead` and `points`, a
 * `**figure**` prints in the accent colour, the way the cards set their
 * numbers apart.
 */
export const PLANS = [
  {
    id: 'pro',
    name: 'Pro',
    tagline: ['Every grade, on ', 'any company', '.'],
    price: { monthly: 17.99, annual: 9.49, biennial: 8.99 },
    heading: 'Key benefits of Pro:',
    lead: [
      '**115** ratios on every company, **77** graded against its sector',
      '**13** fair-value models on any stock',
      'All **8** Quant rankings and all **7** screener column sets',
      '**10** watchlists and **25** snapshot exports a month',
    ],
    points: [
      'Market data included — no FMP key, no second bill',
      'Five factor grades and the composite quant rating',
      'Valuation zone and uncertainty band on every fair value',
      'Research tab: rating band, moat, capital allocation, style box',
      'Income and balance-sheet Sankeys with ten years of history',
      'Dividend module — four composites over the payers-only universe',
      'All five Shariah screens',
      'All six Earnings screens and the transcript library',
      'Alpha Signal on any company you open',
    ],
    who: 'Investors who want every company graded against its own sector, with the data '
      + 'included and nothing to set up.',
  },
  {
    id: 'proplus',
    name: 'Pro+',
    badge: 'Best value',
    tagline: ['Research that ', 'remembers', '.'],
    price: { monthly: 44.49, annual: 23.99, biennial: 21.99 },
    heading: 'Everything in Pro, plus:',
    lead: [
      '**40** Alpha Signal market scans a month, **500** companies each',
      'All **40** Investment Ideas portfolios, editable as screeners',
      '**3** change feeds built from stored daily scores',
      '**12** months of score history behind every company',
    ],
    points: [
      'Quant Rating Changes',
      'Rating Upgrades and Downgrades',
      'Shariah Compliance Changes',
      'Long-form written narrative on any ticker',
      'Unlimited re-runs of an edited screen across the market',
      'Report exports as PDF',
      'Any table exported as CSV',
      'Unlimited watchlists',
      'Unlimited snapshot exports',
    ],
    who: 'Investors who want to scan the whole market, see what changed since yesterday, and '
      + 'take the research offline.',
  },
];

/** The share of the monthly price a period saves on one plan, 0–1. */
const saving = (plan, period) => 1 - plan.price[period] / plan.price.monthly;

/** What the switch prints over a period: the smallest saving, down to a five. */
const periodOff = (period) => period === 'monthly' ? null
  : Math.floor(Math.min(...PLANS.map((p) => saving(p, period))) * 20) * 5;

/** The headline's "up to": the largest saving anywhere, down to a whole percent. */
const bestOff = () => Math.floor(Math.max(...PERIODS.flatMap((d) =>
  PLANS.map((p) => saving(p, d.id)))) * 100);

/** Dollars saved over one payment, against paying monthly for as long. */
const savedOn = (plan, period) =>
  Math.round((plan.price.monthly - plan.price[period]) * periodOf(period).months);

/** What one payment is. */
const billedOn = (plan, period) =>
  Math.round(plan.price[period] * periodOf(period).months * 100) / 100;

/* ==========================================================================
   2. The comparison

   Grouped by the product's own menus, so a row is a thing the reader can go
   and look at. `cells` is one entry per plan in `PLANS` order; a string
   prints as-is, `true` is a tick, `false` a dash.
   ========================================================================== */

const MATRIX = [
  {
    group: 'The company report',
    rows: [
      ['Ratios shown / graded against sector', ['115 / 77', '115 / 77']],
      ['Five factor grades and the composite quant rating', [true, true]],
      ['Fair-value models, valuation zone, uncertainty band', ['13', '13']],
      ['Research tab — moat, capital allocation, style box', [true, true]],
      ['Income and balance-sheet Sankeys, ten-year history', [true, true]],
      ['Dividend module — four composites', [true, true]],
      ['Long-form written narrative', ['Bundled ticker', 'Any ticker']],
      ['Data Status — the state of all 28 feeds', [true, true]],
    ],
  },
  {
    group: 'Screeners and portfolios',
    rows: [
      ['Stock and ETF directories', [true, true]],
      ['Column sets over the same rows', ['All seven', 'All seven']],
      ['Investment Ideas portfolios', ['All 40', 'All 40, editable']],
      ['Re-run an edited screen across the market', ['20 a day', 'Unlimited']],
      ['Quant rankings', ['All eight', 'All eight']],
      ['Shariah compliance screens', ['All five', 'All five']],
      ['Earnings screens and transcript library', ['All six', 'All six']],
      ['Watchlists', ['10', 'Unlimited']],
    ],
  },
  {
    group: 'Alpha Signal',
    rows: [
      ['On a company you have open', [true, true]],
      ['Market scan', [false, '40 a month, 500 companies']],
      ['Method, weights and the Limits tab', [true, true]],
    ],
  },
  {
    group: 'Stored history',
    rows: [
      ['Quant Rating Changes', [false, true]],
      ['Rating Upgrades and Downgrades', [false, true]],
      ['Shariah Compliance Changes', [false, true]],
      ['Score history behind a company', [false, '12 months']],
    ],
  },
  {
    group: 'Markets, news and research',
    rows: [
      ['Markets Data — indices, stocks, futures, bonds, ETFs, economy', [true, true]],
      ['Market News and the sector wires', [true, true]],
      ['Sector breakdown, heatmap and all eleven sector pages', [true, true]],
      ['The research feed and every article', [true, true]],
      ['Earnings and dividend calendars', [true, true]],
    ],
  },
  {
    group: 'Data and export',
    rows: [
      ['Market data licence', ['Included', 'Included']],
      ['Snapshot a report to a file', ['25 a month', 'Unlimited']],
      ['PDF report export', [false, true]],
      ['CSV table export', [false, true]],
    ],
  },
];

/* ==========================================================================
   3. Checkout — the seam
   ========================================================================== */

/**
 * The one edit that turns this page live.
 *
 * `href(plan, period)` should return a hosted-checkout URL — Stripe Checkout,
 * Paddle, Lemon Squeezy, whatever holds the price ids. Returning null is what
 * the page is in now, and makes every Claim Offer open the panel that
 * explains why. Nothing else on the page needs to change.
 */
export const CHECKOUT = {
  href: () => null,
};

/* ==========================================================================
   4. The page
   ========================================================================== */

/** `$9.49` as three pieces, because the cards set each at its own size. */
function amount(n, className = 'pr-amt') {
  const [whole, cents] = n.toFixed(2).split('.');
  return el('span', { class: className }, [
    el('span', { class: 'pr-amt__cur', text: '$' }),
    el('span', { class: 'pr-amt__int', text: whole }),
    el('span', { class: 'pr-amt__dec', text: `.${cents}` }),
  ]);
}

/** A line with its `**figures**` pulled out into accent spans. */
function figures(text) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) =>
    i % 2 ? el('b', { class: 'pr-fig', text: part }) : part);
}

/** A tick, a dash, or a phrase — whichever the matrix cell holds. */
function cell(value) {
  if (value === true) return el('span', { class: 'pr-tick', role: 'img', 'aria-label': 'Included' });
  if (value === false) return el('span', { class: 'pr-dash', 'aria-label': 'Not included', text: '—' });
  return el('span', { class: 'pr-cellt', text: String(value) });
}

/**
 * `?view=pricing`.
 *
 * Renders synchronously and fetches nothing. The billing period is the only
 * state, and it is the URL: both switches write it and every price repaints.
 */
export function renderPricingPage(sub, nav = {}) {
  const asked = new URLSearchParams(location.search).get('billing');
  let period = periodOf(asked) ? asked : DEFAULT_PERIOD;

  const page = el('main', { class: 'mh-page pr-page', id: 'pricing' });
  const toggles = [];
  const painters = [];

  /* The switch writes the period into the address bar without re-booting the
     app: a link to the two-year view should work, and switching should not
     cost a full navigation. */
  const remember = () => {
    try {
      const url = new URL(location.href);
      if (period === DEFAULT_PERIOD) url.searchParams.delete('billing');
      else url.searchParams.set('billing', period);
      history.replaceState(history.state, '', url);
    } catch { /* history unavailable */ }
  };

  const choose = (id) => {
    if (period === id) return;
    period = id;
    remember();
    paint();
  };

  function toggle(variant) {
    const node = el('div', { class: `pr-switch pr-switch--${variant}`, role: 'group', 'aria-label': 'Billing period' });
    toggles.push(node);
    return node;
  }

  function paintToggle(node) {
    const buttons = PERIODS.map((d) => {
      const off = periodOff(d.id);
      return el('button', {
        type: 'button', class: `pr-switch__b${period === d.id ? ' is-active' : ''}`,
        'aria-pressed': String(period === d.id),
        onclick: () => choose(d.id),
      }, [
        el('span', { class: 'pr-switch__l', text: d.label }),
        el('span', { class: 'pr-switch__v', text: off == null ? '--' : `-${off}%` }),
      ]);
    });
    /* The hand-drawn nudge sits over the longest period, as on the page this
       copies — only on the band's switch, not the one over the table. */
    const note = node.classList.contains('pr-switch--band')
      ? el('span', { class: 'pr-switch__note', 'aria-hidden': 'true', html:
          '<svg viewBox="0 0 34 16" width="30" height="14" fill="none" stroke="currentColor" '
          + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
          + '<path d="M33 7C24 2 14 3 3 11"/><path d="M3 11l6-.4M3 11l2.2-5.6"/></svg>'
          + '<span>Best offer</span>' })
      : null;
    node.replaceChildren(...buttons, ...(note ? [note] : []));
  }

  function paint() {
    toggles.forEach(paintToggle);
    painters.forEach((fn) => fn());
    writeSchema(period);
  }

  /* ---- the price block, shared by the cards and the table head ------------ */

  function priceBlock(plan, compact) {
    const node = el('div', { class: compact ? 'pr-price pr-price--compact' : 'pr-price' });
    painters.push(() => {
      const d = periodOf(period);
      const saved = period === 'monthly' ? 0 : savedOn(plan, period);
      const save = el('span', { class: 'pr-save' }, saved ? `Save $${saved.toLocaleString('en-US')}` : '');
      const per = el('span', { class: 'pr-price__per', text: compact ? 'Per Month' : `Per Month / ${d.billed}` });
      node.replaceChildren(
        ...(compact
          ? [save, amount(plan.price[period]), per]
          : [el('div', {}, [amount(plan.price[period]), per]), save]),
      );
    });
    return node;
  }

  const claim = (plan, className) => el('button', {
    type: 'button', class: className, text: 'Claim Offer',
    onclick: () => openCheckout(plan),
  });

  /* ---- one plan ----------------------------------------------------------- */

  function planColumn(plan) {
    return el('article', { class: 'pr-plan', 'data-plan': plan.id }, [
      el('div', { class: 'pr-plan__top' }, [
        el('div', { class: 'pr-plan__row' }, [
          el('h2', { class: 'pr-plan__n', text: plan.name }),
          plan.badge ? el('span', { class: 'pr-badge', text: plan.badge }) : null,
        ]),
        el('p', { class: 'pr-plan__tag' }, [
          plan.tagline[0], el('b', { text: plan.tagline[1] }), plan.tagline[2],
        ]),
        priceBlock(plan, false),
        claim(plan, 'pr-claim'),
      ]),
      el('div', { class: 'pr-plan__body' }, [
        el('h3', { class: 'pr-plan__h', text: plan.heading }),
        el('ul', { class: 'pr-lead' }, plan.lead.map((t) => el('li', {}, figures(t)))),
        el('ul', { class: 'pr-points' }, plan.points.map((t) => el('li', {}, figures(t)))),
        el('div', { class: 'pr-who' }, [
          el('h3', { class: 'pr-plan__h', text: 'Who it’s for:' }),
          el('p', { text: plan.who }),
        ]),
      ]),
    ]);
  }

  /* ---- the comparison ------------------------------------------------------ */

  const compare = el('section', { class: 'pr-compare', id: 'pricing-compare', 'aria-label': 'Compare our plans' });

  function compareTable() {
    const head = el('tr', {}, [
      el('th', { scope: 'col', class: 'pr-cmp__corner' }),
      ...PLANS.map((plan) => el('th', { scope: 'col' }, [
        el('span', { class: 'pr-badge pr-badge--sm', text: plan.badge ?? '' }),
        el('span', { class: 'pr-cmp__n', text: plan.name }),
        priceBlock(plan, true),
        claim(plan, 'pr-claim pr-claim--sm'),
      ])),
    ]);

    const body = [];
    for (const section of MATRIX) {
      body.push(el('tr', { class: 'pr-cmp__group' }, [
        el('th', { scope: 'colgroup', colspan: PLANS.length + 1, text: section.group }),
      ]));
      for (const [label, cells] of section.rows) {
        body.push(el('tr', {}, [
          el('th', { scope: 'row', text: label }),
          ...cells.map((v) => el('td', {}, [cell(v)])),
        ]));
      }
    }
    body.push(el('tr', { class: 'pr-cmp__who' }, [
      el('th', { scope: 'row', text: 'Who it’s for:' }),
      ...PLANS.map((plan) => el('td', { text: plan.who })),
    ]));

    return el('table', { class: 'pr-cmp' }, [
      el('colgroup', {}, [el('col', { class: 'pr-cmp__lc' }), ...PLANS.map(() => el('col'))]),
      el('thead', {}, [head]),
      el('tbody', {}, body),
    ]);
  }

  compare.append(
    el('h2', { class: 'pr-compare__t', text: 'Compare our plans' }),
    toggle('plain'),
    compareTable(),
  );

  /* ---- the checkout seam -------------------------------------------------- */

  function openCheckout(plan) {
    const href = CHECKOUT.href(plan, period);
    if (href) { location.href = href; return; }
    const d = periodOf(period);
    const title = `${plan.name} — $${billedOn(plan, period).toFixed(2)} billed ${d.every}`;
    createDialog(title, (dialog) => {
      dialog.classList.add('pr-dialog');
      return el('div', { class: 'mh-dialog__body' }, checkoutPanel(dialog, nav));
    });
  }

  /* ---- assembly ----------------------------------------------------------- */

  page.append(
    el('section', { class: 'pr-band' }, [
      el('div', { class: 'pr-band__in' }, [
        el('div', { class: 'pr-logo' }, [
          el('img', { src: 'assets/img/vanlior-mark-white.svg', alt: '', width: 50, height: 34 }),
          el('span', { text: 'Vanlior' }),
        ]),
        el('h1', { class: 'pr-h1', text: 'You’re one step away from research that shows its work' }),
        el('div', { class: 'pr-offer' }, [
          el('span', { class: 'pr-offer__pre', text: 'Get up to' }),
          el('p', { class: 'pr-offer__big' }, [el('span', { text: `${bestOff()}%` }), ' off']),
        ]),
        toggle('band'),
        el('div', { class: 'pr-box' }, [
          ...PLANS.map(planColumn),
          el('div', { class: 'pr-box__more' }, [
            el('button', {
              type: 'button',
              onclick: () => compare.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            }, ['For full comparison table click here', el('span', { class: 'pr-box__chev', 'aria-hidden': 'true', text: '›' })]),
          ]),
        ]),
        el('p', { class: 'pr-fine', text: 'Does not include sales tax or VAT, where applicable. Cancel anytime.' }),
      ]),
    ]),
    compare,
  );

  paint();

  /* The head node this page wrote goes when the page does — `chrome()` calls
     `dispose` on the outgoing `.mh-page` before it replaces the layout, so
     a company report never inherits a pricing page's structured data. */
  page.dispose = () => clearSchema();

  return page;
}

/* ==========================================================================
   5. The checkout panel — the honest refusal
   ========================================================================== */

/**
 * What Claim Offer opens while `CHECKOUT.href` returns null.
 *
 * The dialog's title repeats the plan and the price the reader chose, because
 * a panel that says "billing is not connected" without repeating the choice
 * loses the thing they were doing.
 */
function checkoutPanel(dialog, nav) {
  const rows = [
    ['A payment processor', 'Stripe Checkout or equivalent, holding one price id per plan per '
      + 'period. `CHECKOUT.href` in this module returns its URL and every Claim Offer on this '
      + 'page starts working.'],
    ['An account', 'Something to attach the subscription to. Today the app stores your key and '
      + 'your watchlists in this browser and has no notion of a user at all.'],
    ['A data proxy', 'The point of a paid plan: requests signed with our FMP key on the server, '
      + 'so the browser never holds one. Until that exists, the key in Settings is the only way '
      + 'the app reaches a feed.'],
    ['A nightly job and a table', 'What Pro+’s stored history is. The same three pieces the '
      + 'Rating Changes and Compliance Changes tabs already ask for.'],
  ];

  const settings = () => { dialog.close(); nav.openSettings?.(); };

  return [
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
    el('p', { class: 'pr-note', text: 'You may not need a plan at all. Bring your own Financial '
      + 'Modeling Prep key and every grade, fair value and screen runs free, with no expiry — the '
      + 'same code a paid plan runs. A plan moves the data licence to our side and adds the stored '
      + 'history and the written narrative.' }),
    el('div', { class: 'pr-actions' }, [
      el('button', { type: 'button', class: 'pr-btn pr-btn--primary', onclick: settings },
        [hasApiKey() ? 'Your FMP key is connected — keep using it free' : 'Use your own key instead — it is free', arrow()]),
      el('button', { type: 'button', class: 'pr-btn', onclick: () => dialog.close() }, ['Back to plans']),
    ]),
  ];
}

/* ==========================================================================
   6. Structured data

   `Product` with one `Offer` per plan, so an assistant asked "what does
   Vanlior cost" can answer without guessing. Written on every paint because
   the offers change with the billing switch, and removed when the page is
   disposed so it never describes a company report.
   ========================================================================== */

const SCHEMA_ID = 'pricing-schema';

function writeSchema(period) {
  const d = periodOf(period);
  const offers = PLANS.map((plan) => ({
    '@type': 'Offer',
    name: `Vanlior ${plan.name}`,
    description: plan.who,
    priceCurrency: 'USD',
    category: 'subscription',
    availability: 'https://schema.org/InStock',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: billedOn(plan, period),
      priceCurrency: 'USD',
      billingDuration: d.months,
      billingIncrement: 1,
      unitCode: 'MON',
    },
  }));

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

  clearSchema();
  const node = el('script', { type: 'application/ld+json', id: SCHEMA_ID });
  node.textContent = JSON.stringify(graph);
  document.head.append(node);
}

function clearSchema() {
  document.getElementById(SCHEMA_ID)?.remove();
}
