# Back-end contract — what the app expects from the server

For the developer building the back end. The front end (`web/`) already has the seams below; each one is inert
until the back end answers, so nothing here breaks the app while it is being built. Written 2026-10-13.

The rule throughout: **the shared logic lives in `web/src/lib/` and the server imports it.** "Halal", "changed" and
"track record" must mean the same thing on the page and in an alert email. Every file named below is plain
TypeScript with no browser dependency.

## 0. Environment variables

| Variable | Read by | Meaning |
| --- | --- | --- |
| `FMP_API_KEY` | `app/api/data`, `lib/server/*` | The data key. Server only |
| `NEXT_PUBLIC_SITE_URL` | `lib/site.ts` | Public origin for canonical links, `sitemap.xml`, `robots.txt`. **Set before launch**, or they point at localhost |
| `NEXT_PUBLIC_BACKEND_URL` | `lib/backend.ts` | Base URL of the back end (e.g. `https://api.example.com`). Unset: no request is made and the surfaces in §3 stay hidden |
| `NEXT_PUBLIC_PLAN_GATING` | `lib/access.ts` | `on` to lock the paid surfaces for readers below their plan. Leave off until checkout works |

Requests from the browser to the back end use `credentials: 'include'`, so the back end needs CORS for the site's
origin with credentials allowed, or it should be served on the same origin.

## 1. Accounts and plans

- **Plans:** `free`, `pro`, `proPlus` (`lib/access.ts` → `Plan`). Which surface needs which plan is
  `FEATURE_PLAN` in the same file: every halal surface is free; the grade, the implied growth, the risks and the
  full report are `pro`; score history is `proPlus`.
- **Telling the app who the reader is:** wrap the app in
  `<AccessContext.Provider value={{ plan }}>` (`components/access-context.tsx`). The natural place is
  `components/providers.tsx`, fed by a session call such as `GET /me` → `{ plan: 'pro' | 'proPlus' | 'free' | null }`.
- **The front end's check is presentation only.** Once paid figures exist on the server, the server must withhold
  them from a reader without the plan; otherwise the lock is one request away.
- **Checkout:** `CHECKOUT.href` in `components/pages/pricing-page.tsx` is the single place to return a hosted checkout URL.

## 2. Daily halal labels, compliance changes and alerts

**Why:** a label changes without the company filing anything — both ratios divide by market value. Holders want
to be told, and the Pro+ plan promises "Shariah Compliance Changes".

**Nightly job:**
1. For every company in the universe (`lib/server/universe.ts` lists the sitemap's 5,000), compute the label with
   `halalLabel` (`lib/halal-label.ts`). Inputs: profile, latest annual balance sheet and income statement,
   dividends, and the market-cap history (`historical-market-capitalization`). That is the same set
   `lib/server/stock-summary.ts` reads; reuse it.
2. Store one row per company per day:

   ```sql
   create table halal_labels (
     symbol      text not null,
     day         date not null,
     tone        text not null,      -- good | warn | bad | muted
     word        text not null,      -- "Halal · 5 of 5", "Mixed · 3 of 5", "Not halal · AAOIFI"
     headline    text not null,
     source      text not null,      -- researched | quick
     detail      jsonb,              -- the five standards' states and ratios, for the Changes tab
     primary key (symbol, day)
   );
   ```
3. Compare each company with its previous row using `diffLabels` (`lib/compliance-changes.ts`), with records made
   by `recordOf`. A change is a different tone or a different short label; `direction` says better / worse / other,
   and a move to or from "not screened" is never "worse" (missing data is not news about the company).

**Alerts:** a reader subscribes to the symbols in their watchlists (move the watchlists server-side, §5). When a
subscribed symbol has a change, send one email per reader per day listing them, worst first (the order
`diffLabels` returns). The watchlist's Compliance block already shows "Changed since you last looked" from the
browser's own memory (`mazvantage.halal.seen`); once alerts exist, it can read `GET /me/compliance-changes`
instead.

**Pages that read it:** Shariah → Compliance Changes, and Quant → Rating Changes (same job, the overall grade
instead of the label), both of which today say the database is missing.

## 3. Investment Ideas track record

**Why:** "Top Halal Growth Stocks" is only believable beside how the previous list did, and a track record cannot
be rebuilt afterwards.

**Record:** each time a portfolio's list is published or rebalanced (run `runIdea` from `lib/ideas.ts` on a
schedule, e.g. monthly), store its members and their closing prices that day, and the benchmark's (SPY).

**Serve:** `GET {NEXT_PUBLIC_BACKEND_URL}/ideas/{ideaKey}/track-record` →

```json
{
  "periods": [
    {
      "from": "2026-11-01",
      "to": "2026-12-01",
      "members": [{ "symbol": "NVDA", "start": 181.2, "end": 190.4 }],
      "benchmark": { "symbol": "SPY", "start": 655.1, "end": 662.0 }
    }
  ]
}
```

One period per published list, running to the next list (or to the latest close for the current one). `end` is
the member's close on `to`. For a member that stopped trading, send its last traded or deal price. Send `null`
only if there is none; the page then counts it as left out and says how many. Never drop a member silently.

`lib/track-record.ts` (`trackRecord`) chains the periods: equal weight, price return, benchmark over the same
dates. `components/ideas/track-record-card.tsx` shows it on the portfolio page and renders nothing until this
endpoint answers.

## 4. Score history (Pro+)

The pricing page promises 12 months of score history. Store `a.scores.overall` and the five factor scores per
company per day (the same nightly pass as §2, using `analyse` from `lib/model.ts`). It needs the same universe and
the same reads plus ratios and key metrics.

## 5. Browser storage to move server-side

These live in each reader's browser today (`HANDOVER.md` §4, rule 9 — never rename them). With accounts, copy each
into the account on first sign-in, then read from the server:

`watchlists` (lists, symbols, holdings and purchase lots), `notes`, `comparisons`, `screens.saved`,
`home.layout`, `zakat` (the zakat calculator's list), `halal.seen` (last-seen labels, §2).

## 6. Costs to watch

- Server summary: five reads per company per day, cached by the framework (`lib/server/stock-summary.ts`).
- Sitemap universe: one screener read a day.
- Nightly label job (§2): about five reads per company, so about 25,000 a night for 5,000 companies, before the
  shared cache. Spread it over the night; the published per-minute limits apply.
- The shared response cache in the data proxy (`HANDOVER.md` §8.2) is still the largest saving available.
