# Handover — Maz Vantage

For the developer taking over the TypeScript app in `web/`. Read §1–§4 before changing anything,
and §8 before launching. Written 2026-10-02, at commit `069608f` plus the documentation added since.

**Maz Vantage — Market Research to your advantage.** Equity research in the browser: every US
listed company graded against its own sector on 115 ratios across five factors, thirteen
fair-value models, a quant composite, the Alpha Signal, dividend and Shariah screens, market and
sector pages, a stock screener over 245 metrics, 48 curated Investment Ideas portfolios,
watchlists, calendars and a research feed.

---

## 1. What you are inheriting

| | |
|---|---|
| Stack | Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind CSS 4, Radix/shadcn, Recharts, react-google-charts, lucide icons, Vitest |
| Size | about 57,000 lines in `web/src`; 98 `.tsx` files, 90 of them client components (`'use client'`); 21 test files, **246 checks, all passing**; `tsc --noEmit` clean |
| Backend | **None** beyond two Next.js route handlers (a data proxy and an image proxy). No database, no accounts, no payments, no scheduled jobs |
| Data | Financial Modeling Prep (FMP), stable API, through the proxy. Readers are never told the provider (§4) |
| History | Started as a vanilla-JS app, ported to `web/` file by file (`web/PORTING.md`), legacy deleted 2026-10-02 (in git history at `e7659b5` and earlier) |
| Repo | github.com/Yakubyilmaz/mazvantage-page-analysis, **public**. One branch, `main`; commit straight to it |

### Run it
```bash
cd web
npm install
npm run dev
```
Then open http://localhost:3000. With no key the report renders the bundled AAPL capture and the
market pages say live data is unavailable. For live data, copy `web/.env.example` to
`web/.env.local` and set `FMP_API_KEY`.

`npm test` runs Vitest. `npm run typecheck` runs tsc. **Never run `npm run build` while
`npm run dev` is running**: both write to `web/.next` and the build fails.

---

## 2. Map of the app

### Routes (`web/src/app`)
| Route | What |
|---|---|
| `/` | Home (customisable blocks; the default layout stores nothing) |
| `/[view]/[[...sub]]` | **Every menu page.** `components/pages/nav-page.tsx` maps a view to its page component, and `sub` picks the page inside it |
| `/stock/[symbol]/[[...tab]]` | The company report. **The report lives in the layout**, so switching tabs keeps every loaded panel instead of refetching 30+ feeds |
| `/api/data/[...path]` | Data proxy (§3) |
| `/api/img/[alias]/[...path]` | Logo and news-image proxy |
| `src/middleware.ts` | Redirects legacy `?symbol=` / `?view=&sub=` links to real routes. Keep it; old links exist |

### Menus (`web/src/lib/nav.ts`, the single source for the rail, flyouts and footer)
Markets Data · Market News · Stock Screener · ETF Screener · Sectors · Watchlist · Investment Ideas ·
Research · Earnings · Quant · Alpha Signal · Shariah. Also Calendar (rail shortcut) and Pricing
(utility bar and footer).

### The company report: 18 tabs
Overview · Analysis · Research · Ratings · Alpha Signal · Financials · Statistics & Metrics ·
Valuation · Growth · Financial Health · Profitability · Momentum · Technicals · Analysts Forecast ·
Dividends · Transcripts · News · Shariah Compliance. URL slug = `slugify(tab)`, from
`lib/routes.ts`.

### Where the logic is (`web/src/lib`), by question
| Question | Files |
|---|---|
| How is a company graded? | `model.ts` (reads vendor fields; the **only** file that should), `factors.ts`, `grading.ts` (0–5 scale, letter bands), `statistics.ts` |
| Fair values | `valuation-models.ts`, `scenarios.ts` (bull/bear = the six DCFs rerun on analyst high/low revenue) |
| Dividends | `dividend-model.ts`, `dividend-lines.ts`, `dividend-score.ts`, `dividend-grades.ts` (spec: `MAZ_DIVIDEND_SPEC_FULL.md`) |
| Alpha Signal | `alpha-*.ts` (spec: `MAZ_ALPHA_SIGNAL_SPEC.md`) |
| ETFs | `etf-grades.ts`, `etf-tables.ts`, `etf-collections.ts`, `fund-xray.ts` (spec: `MAZ_ETF_SCORING_SPEC.md`) |
| Screens and portfolios | `ideas.ts` (all Investment Ideas; read-only), `screener-filters.ts` (245 metrics), `screener-presets.ts`, `stock-collections.ts` |
| 13F | `institutions.ts` (big-banks portfolio), `superinvestors.ts` |
| Shariah | `shariah.ts`, `shariah-screens.ts` (AAOIFI rules) |
| Markets, sectors, economy | `markethub-data.ts`, `sectors.ts`, `economy-data.ts`, `market-table.ts`, `calendar.ts` |
| Data client | `fmp.ts`, `fmp/paths.ts`, `report-load.ts` |
| Brand | `brand.ts` (+ `components/shell/brand.tsx`) |

Every module opens with a header comment explaining **why** it does what it does. That, plus
`web/PORTING.md`, is the design documentation. Read the header before editing a file.

---

## 3. How data flows

```
browser ─ lib/fmp.ts ─▶ /api/data/<path>?<params> ─▶ FMP stable API
          10-min cache        allow-list (fmp/paths.ts, 79 paths)
          per browser         adds the key server-side
          5 in parallel       neutral error bodies, image hosts rewritten
```

- **Every result is a `FeedResult`** with status `ok`, `gated` (not in the plan), `error` or
  `skipped` (no key). The UI never throws on data; a gap renders as a notice. Keep that contract.
- **Keys.** The server uses `FMP_API_KEY`. The operator can also attach a key with the hidden
  `?apikey=` link. It is stored in the browser as `mazvantage.data.key`, removed from the address
  bar, and sent as the `x-data-key` header. There is **no key field anywhere in the UI**, on purpose.
- **The proxy refuses any path not in the allow-list.** Otherwise it would be an open door to the
  operator's whole plan. To add a feed, add its path to `fmp/paths.ts` and to the catalogue in
  `fmp.ts`.
- **Snapshot fallback.** With no key, `loadDataset` fills feeds from `public/data/AAPL.json`
  (captured 2026-09-22) and tags them `fromSnapshot`. A configured key always wins.
- **No shared server cache yet.** Every reader's browser fetches for itself, so vendor calls grow
  with readers. Fix this before launch (§8).
- Request costs per action are in `FMP_DATA_REQUIREMENTS.md` §5. For example, a report costs up to
  52 requests and the largest Alpha scan about 2,100.

### Testing live pages without a key
Never store a fake key: the proxy would forward it to FMP. Instead, stub `window.fetch` for
`/api/data/*` in the browser tab, serve real sample rows, and flip the in-memory
`setServerKeyAvailable(true)`. `AppProviders` resets that flag on client navigation, so for pages
that reload on navigation, patch `Storage.prototype.getItem` in memory to answer the key read.
Stub tickers must be letters only, five or fewer. When the stub receives a `URL` object, read
`input.href`.

---

## 4. House rules (decisions the owner made; don't undo them silently)

1. **The brand lives in one place.** Use `BRAND_NAME` / `BRAND_SLOGAN` from `lib/brand.ts` and the
   components in `components/shell/brand.tsx`. Never hard-code the name. The wordmark is ES
   Klarheit Kurrent Semibold (`src/fonts/`, `--font-brand`); the UI font is Inter. The slogan's
   "vantage" is blue (`text-rail-accent` on black, `text-primary` elsewhere).
2. **Readers are never told where the data comes from.** No "FMP", "API", "vendor" or "key" in
   anything a reader sees: page text, `public/` files, image URLs, error messages. Replacement
   words in use: "reference", "published", "reported", "Wall Street's". The original source notes
   live in `web/DATA-PROVENANCE.md`, which is not served.
3. **Gaps are stated, not faked.** No invented prices, testimonials, ratings, customer logos or
   links to pages that don't exist. A missing measurement shows as missing, with what it would
   need.
4. **Fair values never feed a grade.** Estimate tails stay raw.
5. **A missing figure is dropped, never scored zero**, and its weight is redistributed. This holds
   for grades, the dividend composites and the Alpha Signal.
6. **Dividends: payers only.** A non-payer is outside the universe, not at the bottom of it (stocks
   and ETFs alike).
7. **ETF grades are relative to the board group only**; a fund never gets the company score.
8. **Investment Ideas portfolios are read-only** (made by the team). Building your own screen
   happens in the Stock Screener. Every portfolio rule carries a descriptor (`metric, op, value`),
   so rules stay introspectable; keep using the builders (`atLeast`, `atMost`, `between`,
   `scoreAtLeast`).
9. **Storage keys are never renamed** (`mazvantage.*`); renaming wipes readers' watchlists and
   settings. Keys in use: `theme`, `watchlists`, `watchlists.unified`, `watchlist` (legacy),
   `notes`, `comparisons`, `screens.saved`, `home.layout`, `lastSymbol`, `market.country`,
   `rail.closed`, `rail.collapsed`, `chart.layout`, `chart.drawings`, `benchmarks`, `data.key`,
   `fmp.key` (migrated once), `narrative.endpoint`.
10. **Every new feature gets a section in `web/PORTING.md`** (files, request cost, tests) in the
    same commit.
11. **Before deleting a function, grep for every caller.** A removed helper broke three pages once.
12. **Verify vendor vocabulary against the live endpoint.** A screener given an unknown sector or
    industry string returns a *wider* universe instead of an error.

---

## 5. Design system

- Tokens in `web/src/app/globals.css`, named the shadcn way (`--background`, `--primary`, …), plus
  `--up/--down`, `--grade-*`, `--chart-*` and `--rail-*`. The look is TradingView-like: canvas
  `#131722` text, primary `#2962ff` (`#5085f7` in dark mode).
- **Light is the default**; dark is `[data-theme="dark"]` on `<html>`, set before first paint. The
  rail, footer and pricing hero are **black in both themes**.
- Sections are flat (heading, then a label-over-value grid). Boxes are only for real objects
  (charts, cards, dialogs).
- Wide tables scroll inside their own box at phone width; the page itself never scrolls sideways.

---

## 6. What is built but thin

| Area | State |
|---|---|
| **Sector distributions** | `public/data/sector-stats.json` and `dividend-stats.json` are **modelled seeds**, not measured. Every sector-relative grade ranks against them. Run `python tools/build_sector_stats.py` with a key to replace them with measured data, ideally as a scheduled job |
| Snapshot | One company (AAPL), dated 2026-09-22. Fine for development; date-relative readings drift |
| Alpha Signal | Weights are **unvalidated** (no history exists to backtest). 6 of 11 categories have gaps FMP cannot fill; AAPL has hand-captured disclosures for some |
| Research narrative | `lib/narrative.ts` tries a configured model endpoint (`mazvantage.narrative.endpoint`), then `public/data/research.json` (AAPL), then generated prose. No model service exists |
| Research feed | 30 sample articles in `public/data/articles.json`, labelled as samples |
| Superinvestors | 19 funds hand-checked 2026-10-01; one fund (Berkshire) bundled as a capture |

---

## 7. Promised on the pricing page, not built

The pricing page (`components/pages/pricing-page.tsx`) sells Pro ($17.99 / $9.49 / $8.99 a month)
and Pro+ ($44.49 / $23.99 / $21.99), billed monthly, yearly or every two years. **Checkout is not
open**: "Claim offer" opens a dialog saying plans cannot be bought yet. `CHECKOUT.href` is the one
seam to wire a hosted checkout into.

| Promise | State |
|---|---|
| Accounts, subscriptions, payment | **Not built.** Everything is open to everyone today |
| Plan limits (10 watchlists, 25 snapshots/month, 20 screener runs/day) | **Not enforced** anywhere |
| Pro+ stored history: Quant Rating Changes, Rating Upgrades and Downgrades, Shariah Compliance Changes, 12 months of score history | **Not built.** Needs a nightly job + a table; the two Changes tabs explain this on the page |
| Pro+ PDF report export | **Not built** (print styles exist; no export) |
| Pro+ CSV export | Built (CSV button on tables) but not gated |
| Pro+ "40 market scans a month, 500 companies each" | Scanner caps at **300**; quota not enforced. Fix the copy or the cap |
| Long-form narrative on any ticker | Needs the model service (§6) |

---

## 8. Before launch (in order)

1. **Data licence.** FMP's Starter, Premium and Ultimate plans are personal, non-commercial licences.
   A public paid app needs FMP's **Data Display and Licensing Agreement** (Build or Enterprise).
   Ask whether **attribution is required**: the app currently shows none (rule 2). Use
   `FMP_DATA_REQUIREMENTS.md` to request the quote.
2. **Shared server cache** in the proxy (quotes about 1 min, prices and fundamentals daily, 13F and
   transcripts until the next filing). Without it, cost scales with readers and one 300-company
   scan bursts about 2,100 requests.
3. **Accounts + payments + plan enforcement** (§7).
4. **Nightly jobs:** measured sector distributions (§6), and stored daily scores for the Pro+
   history tabs.
5. **Font licence.** ES Klarheit Kurrent (Futur Neue) is committed in a public repo and served as a
   webfont. Confirm a webfont licence exists, or replace it (one `src` line in `app/layout.tsx`).
6. **Public repository.** The code, the provider and the business documents are publicly
   readable. Decide whether the repo should be private.
7. Fix three known copy errors:
   - the pricing page's 500-company scans (§7);
   - its "Investment Ideas portfolios: All 40" (there are 48);
   - the ETF "Momentum" grade, labelled total return but actually price return
     (`MAZ_ETF_SCORING_SPEC.md` §8).

### Performance (measured 2026-10-02; the owner said a little JS is fine, so on hold)
First-load JavaScript, gzipped: about 685 KB on menu pages, about 570 KB on the report, 406 KB
home, 241 KB of shell shared by all. In order of payoff:
1. `next/dynamic` per menu page in `nav-page.tsx`, which imports all 14 pages statically today.
2. Lazy-load Recharts.
3. Move the model and idea tables out of the shared shell.
4. Server Components for text-only pages (pricing, method pages, articles, footer).

---

## 9. Not started (owner's backlog)

From the competitor gap analysis (all 16 "group 1" features are built; see `web/PORTING.md`):
- **Group 2, AI layer:** chat, auto-reports, call summaries, "why is it moving".
- **Group 3, accounts and backend:** alerts, rating history, track records, PDF, sync.
- **Group 4, data FMP lacks:** options, short interest, pre-market, estimate revisions.
- **Group 5:** excluded on purpose.

These need a decision from the owner before work starts.

---

## 10. Documents

| File | What |
|---|---|
| `README.md` | Quick start, layout, house rules (short) |
| `web/PORTING.md` | Every module and feature: files, request cost, tests, decisions |
| `web/DATA-PROVENANCE.md` | Where each bundled data file came from (not served) |
| `MAZ_DIVIDEND_SPEC_FULL.md` | Dividend module spec (the owner's) |
| `MAZ_ALPHA_SIGNAL_SPEC.md` | Alpha Signal: logic, replication, AAPL anchor, model prompt, original master prompt |
| `MAZ_ETF_SCORING_SPEC.md` | ETF grades and Fund X-Ray |
| `FMP_DATA_REQUIREMENTS.md` | All 79 endpoints, coverage, volumes, questions for the vendor quote |
| `tools/capture/README.md` | How the hand-captured data was read |

**Recoverable from history if needed:** the vanilla-JS app, its README and old HANDOVER
(`e7659b5`); the removed Supply Chain tab, as unreferenced commit `71f0129` ("Snapshot before
removing the Supply Chain tab"). That commit belongs to no branch, so Git will eventually delete
it. Tag it if it should be kept.
