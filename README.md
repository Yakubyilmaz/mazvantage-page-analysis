# Maz Vantage

**Market Research to your advantage.**

Equity research in the browser: every listed company graded against its own
sector on 115 ratios across five factors, thirteen fair-value models, a quant
composite, an Alpha Signal, dividend and Shariah screens, market and sector
pages, a stock screener over 245 metrics, curated Investment Ideas portfolios,
watchlists, calendars and a research feed.

The app is in [`web/`](web/): Next.js 14 (App Router), React 18, TypeScript,
Tailwind CSS 4, Radix/shadcn components, Recharts and react-google-charts,
tested with Vitest.

## Getting started

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

With no data key the app still runs: the stock report renders the bundled AAPL
snapshot in `web/public/data/`, and the market pages say live data is
unavailable. For live data, copy `web/.env.example` to `web/.env.local` and set
the key there. It stays on the server: every data request goes through the
app's own `/api/data` route, and logos through `/api/img`.

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | The Vitest suite in `web/tests/` |

Don't run `npm run build` while the dev server is up: both write to
`web/.next`.

## Layout

```
web/
  src/app/          routes: /, /[view]/[[...sub]] (every menu page),
                    /stock/[symbol]/[[...tab]] (the company report), api/data, api/img
  src/components/   shell (rail, utility bar, footer, brand), pages, report tabs,
                    market tables and charts, ui primitives
  src/lib/          the model and everything that is not drawing: grading, factors,
                    fair values, screens, ideas, calendars, formatting, the data client
  tests/            Vitest suites
  public/data/      bundled snapshot, sector and dividend distributions, sample articles
tools/              Python only — data generators and the snapshot capture
```

Each module opens with a header comment explaining what it does and why the
non-obvious choices were made; that is the main design documentation.

## Documents

- [`HANDOVER.md`](HANDOVER.md): **start here** — the state of the project,
  the rules, what is promised but not built, and what to do before launch.
- [`web/PORTING.md`](web/PORTING.md): how the app was built, module by module,
  and every feature added since, with its files, cost and tests.
- [`web/DATA-PROVENANCE.md`](web/DATA-PROVENANCE.md): where each bundled data
  file comes from. Repo only; it is not served.
- [`MAZ_DIVIDEND_SPEC_FULL.md`](MAZ_DIVIDEND_SPEC_FULL.md): the dividend
  module's specification.
- [`MAZ_ALPHA_SIGNAL_SPEC.md`](MAZ_ALPHA_SIGNAL_SPEC.md): the Alpha Signal's
  logic, how to replicate it, the model prompt and the original master prompt.
- [`MAZ_ETF_SCORING_SPEC.md`](MAZ_ETF_SCORING_SPEC.md): the five ETF grades.
- [`FMP_DATA_REQUIREMENTS.md`](FMP_DATA_REQUIREMENTS.md): every market-data
  endpoint the app uses, for a vendor quote.
- [`tools/capture/README.md`](tools/capture/README.md): how the hand-captured
  data files were made.

## Data tools

The Python scripts write into `web/public/data/`:

```bash
python tools/make_seed_stats.py      # modelled sector distributions (offline)
python tools/make_dividend_seed.py   # modelled dividend-payer distributions (offline)
python tools/build_sector_stats.py   # measured sector distributions (needs a data key)
```

## House rules

- **The brand lives in one place.** `web/src/lib/brand.ts` holds the name and
  slogan; `web/src/components/shell/brand.tsx` draws the mark, the wordmark (ES
  Klarheit Kurrent Semibold) and the slogan.
- **Readers are never told where the data comes from.** No provider name,
  "API", "vendor" or key in anything a reader sees: page text, `public/` files,
  image addresses or error messages.
- **Gaps are stated, not faked.** No invented prices, testimonials, ratings or
  links to pages that do not exist.
- **Fair values never feed a grade.**

## History

Until 2026-10-02 the repository also held the original vanilla-JavaScript
version (`index.html`, `assets/`, `serve.py`), which this app replaced. It was
removed then; its code, README and handover notes remain in git history, at
commit `e7659b5` and earlier.
