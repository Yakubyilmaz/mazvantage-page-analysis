'use client';

/* ==========================================================================
   Maz Vantage — plans and pricing (`/pricing`)

   Remodelled 2026-10-02 on TradingView's pricing page, on this app's own
   tokens. Its shape, checked on tradingview.com/pricing: a dark hero with one
   big headline, a radio pair for the billing period with a "Save up to" chip,
   every plan as a column of one bordered container (name, price "/ mo",
   "billed annually", "Save $X a year", a full-width button, the plan's own
   numbers first, then the *same* feature list in every column with what the
   plan lacks greyed out), and under it a grouped "Compare plans" table with a
   sticky head and "Show all features".

   What did not change: the plans (Pro, Pro+), every price, the three periods
   and the Yearly default, the `?billing=` address, the comparison rows and the
   checkout dialog. Before this it was laid out after Investing.com's Pro page.

   - **The hero is black in both themes**, like the rail and the footer; the
     comparison below it themes. Blue is the design system's primary, with
     the dark theme's brighter value on black (`text-rail-accent`).
   - **No bring-your-own-key option (2026-10-01).** Readers are not told where
     the data comes from; the operator's hidden `?apikey=` link still works.
   - **The percentages are computed, never typed.** The chip shows the largest
     saving anywhere, rounded down, so it never promises more than a plan does.
   - **No checkout, and the page says so.** `CHECKOUT.href` is the one edit
     that turns it live. No testimonials, logos or `aggregateRating`: there
     are no customers yet, so all three would be fabricated.
   ========================================================================== */

import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { PageFrame, useQueryState } from '@/components/pages/page-parts';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BrandMark, Slogan, Wordmark } from '@/components/shell/brand';
import { BRAND_NAME } from '@/lib/brand';
import { screenMetrics } from '@/lib/screener-filters';
import { cn } from '@/lib/cn';

/* ==========================================================================
   1. The plans
   ========================================================================== */

/** The periods, in the order they print. `months` is how much one payment covers. */
const PERIODS = [
  { id: 'monthly', label: 'Monthly', months: 1, every: 'monthly' },
  { id: 'annual', label: 'Yearly', months: 12, every: 'annually' },
  { id: 'biennial', label: '2 Years', months: 24, every: 'every two years' },
] as const;
type PeriodId = (typeof PERIODS)[number]['id'];
const DEFAULT_PERIOD: PeriodId = 'annual';
const periodOf = (id: string | null | undefined) => PERIODS.find((p) => p.id === id);

/** The screener's metric count, read from the screener so the page cannot go stale. */
const METRICS = screenMetrics().length;

interface Plan {
  id: string; name: string; badge?: string; tagline: [string, string, string];
  price: Record<PeriodId, number>;
  /** The plan's own numbers, line for line against the other plan's — `**figures**` are emphasised. */
  keys: string[];
  who: string;
}

/** Two plans, cheapest first. `price` is dollars a month on each period. */
export const PLANS: Plan[] = [
  {
    id: 'pro', name: 'Pro', tagline: ['Every grade, on ', 'any company', '.'],
    price: { monthly: 17.99, annual: 9.49, biennial: 8.99 },
    keys: [
      '**115** ratios on every company, **77** graded against its sector',
      '**13** fair-value models on any stock',
      '**10** watchlists',
      '**25** snapshot exports a month',
      `**20** Stock Screener filter runs a day, over **${METRICS}** metrics`,
      '**0** Alpha Signal market scans',
      '**0** months of stored score history',
    ],
    who: 'Investors who want every company graded against its own sector, with the data included and nothing to set up.',
  },
  {
    id: 'proplus', name: 'Pro+', badge: 'Best value', tagline: ['Research that ', 'remembers', '.'],
    price: { monthly: 44.49, annual: 23.99, biennial: 21.99 },
    keys: [
      '**115** ratios on every company, **77** graded against its sector',
      '**13** fair-value models on any stock',
      '**Unlimited** watchlists',
      '**Unlimited** snapshot exports',
      `**Unlimited** Stock Screener filter runs, over **${METRICS}** metrics`,
      '**40** Alpha Signal market scans a month, **500** companies each',
      '**12** months of stored score history behind every company',
    ],
    who: 'Investors who want to scan the whole market, see what changed since yesterday, and take the research offline.',
  },
];

/** One list for every column; a plan that lacks a feature prints it greyed out. */
const FEATURES: { label: string; in: string[] }[] = [
  { label: 'Market data included — no second bill', in: ['pro', 'proplus'] },
  { label: 'Five factor grades and the composite quant rating', in: ['pro', 'proplus'] },
  { label: 'Valuation zone and uncertainty band on every fair value', in: ['pro', 'proplus'] },
  { label: 'Research tab: rating band, moat, capital allocation, style box', in: ['pro', 'proplus'] },
  { label: 'Income and balance-sheet Sankeys with ten years of history', in: ['pro', 'proplus'] },
  { label: 'Dividend module — four composites over the payers-only universe', in: ['pro', 'proplus'] },
  { label: 'All 8 Quant rankings and all 7 screener column sets', in: ['pro', 'proplus'] },
  { label: 'All five Shariah screens', in: ['pro', 'proplus'] },
  { label: 'All six Earnings screens and the transcript library', in: ['pro', 'proplus'] },
  { label: 'Alpha Signal on any company you open', in: ['pro', 'proplus'] },
  { label: 'Quant Rating Changes', in: ['proplus'] },
  { label: 'Rating Upgrades and Downgrades', in: ['proplus'] },
  { label: 'Shariah Compliance Changes', in: ['proplus'] },
  { label: 'Long-form written narrative on any ticker', in: ['proplus'] },
  { label: 'Report exports as PDF', in: ['proplus'] },
  { label: 'Any table exported as CSV', in: ['proplus'] },
];

/** The share of the monthly price a period saves on one plan, 0–1. */
const saving = (plan: Plan, period: PeriodId) => 1 - plan.price[period] / plan.price.monthly;
/** The chip's "up to": the largest saving anywhere, down to a whole percent. */
const bestOff = () => Math.floor(Math.max(...PERIODS.flatMap((d) => PLANS.map((p) => saving(p, d.id)))) * 100);
/** Dollars saved over one payment, against paying monthly for as long. */
const savedOn = (plan: Plan, period: PeriodId) => Math.round((plan.price.monthly - plan.price[period]) * periodOf(period)!.months);
/** What one payment is. */
const billedOn = (plan: Plan, period: PeriodId) => Math.round(plan.price[period] * periodOf(period)!.months * 100) / 100;

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ==========================================================================
   2. The comparison — grouped by the product's own menus; `true` is a tick,
   `false` a dash, a string prints as-is.
   ========================================================================== */

const MATRIX: { group: string; rows: [string, (string | boolean)[]][] }[] = [
  { group: 'The company report', rows: [
    ['Ratios shown / graded against sector', ['115 / 77', '115 / 77']],
    ['Five factor grades and the composite quant rating', [true, true]],
    ['Fair-value models, valuation zone, uncertainty band', ['13', '13']],
    ['Research tab — moat, capital allocation, style box', [true, true]],
    ['Income and balance-sheet Sankeys, ten-year history', [true, true]],
    ['Dividend module — four composites', [true, true]],
    ['Long-form written narrative', ['Bundled ticker', 'Any ticker']],
    ['Data Status — the state of all 28 feeds', [true, true]],
  ] },
  { group: 'Screeners and portfolios', rows: [
    ['Stock and ETF directories', [true, true]],
    ['Column sets over the same rows', ['All seven', 'All seven']],
    ['Investment Ideas portfolios (curated, fixed rules)', ['All 40', 'All 40']],
    [`Stock Screener company filters — ${METRICS} metrics`, ['20 runs a day', 'Unlimited']],
    ['Quant rankings', ['All eight', 'All eight']],
    ['Shariah compliance screens', ['All five', 'All five']],
    ['Earnings screens and transcript library', ['All six', 'All six']],
    ['Watchlists', ['10', 'Unlimited']],
  ] },
  { group: 'Alpha Signal', rows: [
    ['On a company you have open', [true, true]],
    ['Market scan', [false, '40 a month, 500 companies']],
    ['Method, weights and the Limits tab', [true, true]],
  ] },
  { group: 'Stored history', rows: [
    ['Quant Rating Changes', [false, true]],
    ['Rating Upgrades and Downgrades', [false, true]],
    ['Shariah Compliance Changes', [false, true]],
    ['Score history behind a company', [false, '12 months']],
  ] },
  { group: 'Markets, news and research', rows: [
    ['Markets Data — indices, stocks, futures, bonds, ETFs, economy', [true, true]],
    ['Market News and the sector wires', [true, true]],
    ['Sector breakdown, heatmap and all eleven sector pages', [true, true]],
    ['The research feed and every article', [true, true]],
    ['Earnings and dividend calendars', [true, true]],
  ] },
  { group: 'Data and export', rows: [
    ['Market data licence', ['Included', 'Included']],
    ['Snapshot a report to a file', ['25 a month', 'Unlimited']],
    ['PDF report export', [false, true]],
    ['CSV table export', [false, true]],
  ] },
];

/** Groups shown before "Show all features", as TradingView folds its table. */
const FOLDED_GROUPS = 2;

/* ==========================================================================
   3. Checkout — the seam. `href(plan, period)` returns a hosted-checkout URL
   (Stripe Checkout, Paddle…); null is what the page is in now, and makes every
   Claim offer open the panel that explains why.
   ========================================================================== */

export const CHECKOUT: { href: (plan: Plan, period: PeriodId) => string | null } = { href: () => null };

/* ==========================================================================
   4. The page
   ========================================================================== */

/** A line with its `**figures**` pulled out in bold. */
const figures = (text: string) => text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <b key={i} className="font-semibold text-white">{part}</b> : part));

/** The billing period as radios, the "Save up to" chip beside them. */
function PeriodRadios({ period, onChoose }: { period: PeriodId; onChoose: (id: PeriodId) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
      <div role="radiogroup" aria-label="Billing period" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {PERIODS.map((d) => (
          <label key={d.id} className="group inline-flex cursor-pointer items-center gap-2 text-[15px] font-medium text-white/85 hover:text-white">
            <input type="radio" name="billing" value={d.id} checked={period === d.id} onChange={() => onChoose(d.id)} className="peer sr-only" />
            <span aria-hidden="true"
              className="grid size-[18px] place-items-center rounded-full border-2 border-white/50 transition-colors group-hover:border-white peer-checked:border-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rail-accent [&>span]:scale-0 peer-checked:[&>span]:scale-100">
              <span className="size-2 rounded-full bg-white transition-transform" />
            </span>
            <span className="peer-checked:text-white">{d.label}</span>
          </label>
        ))}
      </div>
      <span className="rounded-md bg-white/10 px-2.5 py-1 text-13 font-semibold text-white">
        Save up to <span className="text-rail-accent">{bestOff()}%</span>
      </span>
    </div>
  );
}

/** One plan, as a column of the hero's container. */
function PlanColumn({ plan, period, onClaim }: { plan: Plan; period: PeriodId; onClaim: (plan: Plan) => void }) {
  const d = periodOf(period)!;
  const saved = period === 'monthly' ? 0 : savedOn(plan, period);
  const featured = Boolean(plan.badge);
  const claim = (
    <button type="button" onClick={() => onClaim(plan)}
      className={cn('w-full rounded-lg py-3 text-[15px] font-semibold transition-colors focus-visible:outline-rail-accent',
        featured ? 'bg-primary text-primary-foreground hover:bg-[#1e53e5]' : 'bg-white text-[#131722] hover:bg-white/85')}>
      Claim offer
    </button>
  );
  return (
    // Four rows — head, numbers, features, button — on the container's subgrid, so each section starts level across the columns.
    <article data-plan={plan.id} aria-labelledby={`plan-${plan.id}`} className="row-span-4 grid grid-rows-subgrid gap-6 p-7 max-sm:p-5">
      <div className="grid gap-4">
        <div className="flex min-h-7 items-center justify-between gap-3">
          <h2 id={`plan-${plan.id}`} className="text-lg font-semibold">{plan.name}</h2>
          {plan.badge ? <span className="rounded-full bg-primary/20 px-3 py-1 text-tiny font-semibold text-rail-accent">{plan.badge}</span> : null}
        </div>
        <p className="text-[15px] text-white/70">{plan.tagline[0]}<b className="font-semibold text-white">{plan.tagline[1]}</b>{plan.tagline[2]}</p>
        <div className="grid gap-1">
          <p className="flex items-baseline gap-1.5">
            <span className="text-[44px] font-bold leading-none tracking-[-.02em] tnum max-sm:text-[38px]">{money(plan.price[period])}</span>
            <span className="text-sm text-white/60">/ mo</span>
          </p>
          <p className="text-13 text-white/60">{period === 'monthly' ? 'billed monthly' : <>{money(billedOn(plan, period))} billed {d.every}</>}</p>
          <p className={cn('text-13 font-semibold text-rail-accent', !saved && 'invisible')}>
            {saved ? `Save $${saved.toLocaleString('en-US')} ${period === 'annual' ? 'a year' : 'over two years'}` : 'No saving'}
          </p>
        </div>
        {claim}
      </div>
      <ul className="grid content-start gap-2.5 text-sm text-white/80" aria-label={`${plan.name} in numbers`}>
        {plan.keys.map((t, k) => <li key={k}>{figures(t)}</li>)}
      </ul>
      <ul className="grid content-start gap-2.5 border-t border-white/10 pt-6 text-sm" aria-label={`${plan.name} features`}>
        {FEATURES.map((f) => {
          const has = f.in.includes(plan.id);
          return (
            <li key={f.label} className={cn('flex gap-2.5', has ? 'text-white/85' : 'text-white/30')}>
              {has
                ? <Check aria-hidden="true" className="mt-0.5 size-4 flex-none text-rail-accent" strokeWidth={2.5} />
                : <Minus aria-hidden="true" className="mt-0.5 size-4 flex-none" strokeWidth={2.5} />}
              <span>{f.label}{has ? null : <span className="sr-only"> (not included)</span>}</span>
            </li>
          );
        })}
      </ul>
      <div className="self-end">{claim}</div>
    </article>
  );
}

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check role="img" aria-label="Included" className="mx-auto size-[18px] text-primary" strokeWidth={2.5} />;
  if (value === false) return <Minus role="img" aria-label="Not included" className="mx-auto size-[18px] text-muted-foreground/60" strokeWidth={2.5} />;
  return <span className="text-sm">{value}</span>;
}

function CheckoutDialog({ plan, period, onClose }: { plan: Plan | null; period: PeriodId; onClose: () => void }) {
  const d = periodOf(period)!;
  return (
    <Dialog open={Boolean(plan)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        {plan ? (
          <>
            <DialogTitle className="pr-8 text-xl font-bold">{plan.name} — ${billedOn(plan, period).toFixed(2)} billed {d.every}</DialogTitle>
            <div className="grid gap-4 text-sm">
              {/* What checkout still needs, for whoever connects it (not shown to readers since 2026-10-01, because it named the
                  data plumbing): a payment processor holding one price id per plan per period — `CHECKOUT.href` returns its URL;
                  an account to attach the subscription to; a data licence and server key of our own behind `/api/data`; and a
                  nightly job and table for Pro+'s stored history, the same pieces the Rating Changes and Compliance Changes tabs need. */}
              <p className="rounded-lg border-l-[3px] border-warning bg-warning/8 px-4 py-3 leading-relaxed">
                <b>Checkout is not open yet.</b> Plans cannot be bought in this version, and nothing will be charged. Every grade, fair value and
                screen on this site works as it does today in the meantime.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-2 text-13 font-semibold hover:bg-accent">Back to plans</button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* Structured data: `Product` with one `Offer` per plan, so an assistant asked
   "what does Maz Vantage cost" can answer without guessing. Deliberately no
   `aggregateRating` and no `review`: there are none, and inventing either is
   the one thing structured data makes trivially easy and dishonest. */
function schemaFor(period: PeriodId) {
  const d = periodOf(period)!;
  return {
    '@context': 'https://schema.org', '@type': 'Product', name: BRAND_NAME,
    description: 'Equity research: every listed company graded against its own sector on 77 ratios, thirteen fair-value models, a quant composite and an alpha signal.',
    brand: { '@type': 'Brand', name: BRAND_NAME },
    offers: PLANS.map((plan) => ({
      '@type': 'Offer', name: `${BRAND_NAME} ${plan.name}`, description: plan.who, priceCurrency: 'USD', category: 'subscription',
      availability: 'https://schema.org/InStock',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: billedOn(plan, period), priceCurrency: 'USD', billingDuration: d.months, billingIncrement: 1, unitCode: 'MON' },
    })),
  };
}

export function PricingPage() {
  const q = useQueryState();
  const asked = q.get('billing');
  const period: PeriodId = periodOf(asked) ? (asked as PeriodId) : DEFAULT_PERIOD;
  const [checkout, setCheckout] = React.useState<Plan | null>(null);
  const [allRows, setAllRows] = React.useState(false);
  const choose = (id: PeriodId) => { if (id !== period) q.set({ billing: id === DEFAULT_PERIOD ? null : id }); };
  const claim = (plan: Plan) => {
    const href = CHECKOUT.href(plan, period);
    if (href) { window.location.href = href; return; }
    setCheckout(plan);
  };
  const d = periodOf(period)!;
  const groups = allRows ? MATRIX : MATRIX.slice(0, FOLDED_GROUPS);

  return (
    <PageFrame id="pricing" className="pb-[72px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFor(period)) }} />

      {/* The hero: black in both themes, two soft glows in the design system's blue and violet. */}
      <section aria-labelledby="pricing-title" className="relative isolate -mx-gutter overflow-hidden bg-black px-gutter pb-16 pt-14 text-white max-sm:pt-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px]"
          style={{ backgroundImage: 'radial-gradient(42% 60% at 28% 0%, rgb(41 98 255 / .38), transparent 70%), radial-gradient(38% 55% at 74% 4%, rgb(157 78 221 / .30), transparent 70%)' }} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] opacity-60"
          style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / .22) 1px, transparent 1px)', backgroundSize: '34px 34px', maskImage: 'linear-gradient(#000, transparent 75%)', WebkitMaskImage: 'linear-gradient(#000, transparent 75%)' }} />

        <div className="mx-auto grid max-w-[1080px] justify-items-center gap-7 text-center">
          <div className="grid justify-items-center gap-2.5">
            <span className="inline-flex items-center gap-3">
              <BrandMark className="h-7 max-sm:h-6" />
              <Wordmark className="text-[28px] max-sm:text-2xl" />
            </span>
            <Slogan onBlack className="text-[15px] text-white/70" />
          </div>
          <h1 id="pricing-title" className="max-w-[16ch] text-[clamp(36px,5vw,64px)] font-bold leading-[1.04] tracking-[-.035em]">
            Plans for every depth of research
          </h1>
          <PeriodRadios period={period} onChoose={choose} />

          {/* Every plan as a column of one container, edged in a blue-to-violet line. */}
          <div className="w-full rounded-[18px] bg-[linear-gradient(100deg,#2962ff,#9d4edd)] p-px text-left shadow-[0_30px_80px_-30px_rgb(41_98_255/.45)]">
            <div className="grid divide-white/10 overflow-hidden rounded-[17px] bg-[#0c0f17] max-md:divide-y md:grid-flow-col md:grid-cols-2 md:grid-rows-[repeat(4,auto)] md:divide-x">
              {PLANS.map((plan) => <PlanColumn key={plan.id} plan={plan} period={period} onClaim={claim} />)}
            </div>
          </div>
          <p className="max-w-[70ch] text-tiny leading-relaxed text-white/55">
            Prices in US dollars. Sales tax or VAT may be added at checkout, depending on where you live. Cancel anytime.
          </p>
        </div>
      </section>

      {/* The comparison, on the themed canvas. The head sticks under the utility bar once the table is wide enough
          not to scroll sideways; on a phone it scrolls with the table instead. */}
      <section aria-labelledby="pricing-compare-title" id="pricing-compare" className="mx-auto grid max-w-[1080px] scroll-mt-[90px] gap-8 pt-16">
        <h2 id="pricing-compare-title" className="text-center text-[clamp(28px,3.2vw,40px)] font-bold tracking-[-.03em]">Compare plans</h2>
        <div className="max-md:overflow-x-auto max-md:scroll-thin">
          <table className="w-full min-w-[560px] border-collapse">
            <caption className="sr-only">Pro and Pro+ compared, prices billed {d.every}</caption>
            <colgroup><col className="w-[46%]" />{PLANS.map((p) => <col key={p.id} />)}</colgroup>
            <thead className="md:sticky md:top-[var(--utilbar-h,58px)] md:z-20">
              <tr className="border-b border-border bg-background">
                <th scope="col" className="py-4 text-left align-bottom text-13 font-normal text-muted-foreground">
                  Price per month, billed {d.every}
                </th>
                {PLANS.map((plan) => (
                  <th key={plan.id} scope="col" className="px-3 py-4 align-bottom">
                    <div className="grid justify-items-center gap-1.5">
                      <span className="flex items-center gap-2 text-base font-semibold">
                        {plan.name}
                        {plan.badge ? <span className="rounded-full bg-primary/12 px-2 py-0.5 text-micro font-semibold text-primary">{plan.badge}</span> : null}
                      </span>
                      <span className="text-sm font-normal text-muted-foreground tnum"><b className="font-semibold text-foreground">{money(plan.price[period])}</b> / mo</span>
                      <button type="button" onClick={() => claim(plan)}
                        className={cn('mt-1 w-full max-w-[180px] rounded-lg px-4 py-2 text-13 font-semibold transition-colors',
                          plan.badge ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border hover:bg-accent')}>
                        Claim offer
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody id="pricing-compare-rows">
              {groups.map((section) => (
                <React.Fragment key={section.group}>
                  <tr>
                    <th scope="colgroup" colSpan={PLANS.length + 1} className="pb-3 pt-9 text-left text-lg font-semibold tracking-[-.01em]">{section.group}</th>
                  </tr>
                  {section.rows.map(([label, cells]) => (
                    <tr key={label} className="border-b border-border transition-colors hover:bg-muted">
                      <th scope="row" className="py-3.5 pr-3 text-left text-sm font-normal">{label}</th>
                      {cells.map((v, i) => <td key={i} className="px-3 py-3.5 text-center"><Cell value={v} /></td>)}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {allRows ? (
                <tr>
                  <th scope="row" className="py-5 pr-3 text-left align-top text-sm font-semibold">Who it’s for</th>
                  {PLANS.map((plan) => <td key={plan.id} className="px-3 py-5 text-center align-top text-13 leading-relaxed text-muted-foreground">{plan.who}</td>)}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex justify-center">
          <button type="button" aria-expanded={allRows} aria-controls="pricing-compare-rows"
            onClick={() => {
              setAllRows(!allRows);
              if (allRows) document.getElementById('pricing-compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="rounded-lg border border-border px-6 py-2.5 text-sm font-semibold transition-colors hover:bg-accent">
            {allRows ? 'Show fewer features' : 'Show all features'}
          </button>
        </div>
      </section>
      <CheckoutDialog plan={checkout} period={period} onClose={() => setCheckout(null)} />
    </PageFrame>
  );
}
