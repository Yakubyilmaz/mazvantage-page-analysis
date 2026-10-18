# Research tab: the reusable prompt

How to produce the stock page's **Research** tab for any company, to the
standard of the AAPL and NVDA reports. Paste the prompt in section 1 into a new
Claude Code session in this repository, replace `{SYMBOL}`, and let it work
through the phases. Sections 2–8 are the reference the prompt points to: the
frame, the rules, the tools, the record templates, and the traps.

Written 2026-10-17 from the AAPL (8 Sep, 12 Oct 2026) and NVDA (10 Oct 2026)
reports. If the code changes, the code wins; update this file with it.

---

## 1. The prompt (copy from here)

```text
Produce the Research tab of the stock page for {SYMBOL}, to the standard of the
AAPL and NVDA reports, by following RESEARCH_TAB_PROMPT.md in this repository.
Read that file first, then:

PHASE 0 — Scope. Check whether web/public/data/{SYMBOL}.json exists and how old
it is, the company's sector and fiscal year end, its peer list, and which
records already exist for it (grep {SYMBOL} in web/src/lib/research-editions.ts,
debates.ts, research-voices.ts, events.ts, risk-factors.ts, guidance.ts,
industry.ts, shariah-issuers.ts, letters.ts, and public/data/research.json,
consensus-ledger.json, ownership.json, management-voice.json, history/).
Tell me what exists, what you will build, and anything that blocks you.

PHASE 1 — Capture the data (section 4.1). A live key in FMP_API_KEY: run
tools/research/capture_snapshot.py live {SYMBOL} (add --with-earnings for a
company with no edition yet). No key: pull every feed in
section 6 through the market-data connector, save the replies with
tools/research/recover_connector.py, then capture_snapshot.py dir. Then add
today's consensus capture to the ledger (consensus_ledger.py). Never put a key,
my email or any personal data in a file, a URL or a header.

PHASE 2 — Read the primary sources (section 4.2): the last six earnings-call
transcripts, the latest two 10-Ks (Item 1A), the latest DEF 14A, the latest
10-Q, the company's own releases since the last 10-K, the researchers' free
press releases for its market, and the Letters & Outlooks library. Keep
copyrighted texts in tools/research/work/{SYMBOL}/ (git-ignored); the app
keeps short quotes and our own words, never the documents.

PHASE 3 — Write the records, in this order (sections 4.3 and 5): the
narrative (from the brief), the edition, the outside voices, the key debates,
recent developments, the risk-factor review, management's record (guidance and
pay), the industry tables, the call reading, letter mentions, and optionally
the Shariah issuer record. Every figure from the brief or a named primary
source; every quote verbatim with its source and date; everything of ours
labelled as ours.

PHASE 4 — Fact-check (section 7). Run the tests, the quote checker and the
figure check; check every hand-written claim against its source; open the page
in the browser (AAPL and {SYMBOL}) and read every section; fix, then re-run.
Report what you verified, what you corrected, and what is still open, plainly.

Rules that override everything: the model never invents a number; quotes are
verbatim; secondary coverage is never the source of a figure; ratings are
computed, not written; nothing is investment advice; do not commit unless I ask.
```

---

## 2. The frame: what the tab shows, and who builds each part

The order is fixed in `web/src/components/report/tabs/research-tab.tsx`
(`CONTENTS` and the body of `ResearchTab`). Most of the tab is **computed for
every company** from its snapshot; a minority is **written per company** from
primary sources. Exhibit numbers are reserved per section in `ResearchTab`
(gaps possible, never repeats).

| # | Section | Built by | Per-company work |
|---|---|---|---|
| — | Running head, ratings strip, Price vs Fair Value, Contents, Key Statistics, Business Description | code | none |
| 1 | **Analyst Note** (headline, why it matters, bottom line) + what changed since the last edition + earnings note + editions on record | narrative `note` or generated; `research-editions.ts`; `management-voice.json` | narrative, edition, call reading |
| 2 | **Recent Developments** | `lib/events.ts` | an event record per material event (optional) |
| 3 | **What the Price Implies** (reverse DCF, growth × margin grid) | `lib/implied-expectations.ts` | none |
| 4 | **Key Debates** + consensus map | `lib/debates.ts` | four debates |
| 5 | **Alpha Signal: Is Something Changing?** | `useAlphaReading` (alpha engine) + `ManagementVoice` + `FirmViews` | call reading feeds its management part |
| 6 | **Business Strategy & Outlook** + segment chart + the market around it | narrative `strategy` or generated; `lib/industry.ts` | narrative; industry tables |
| 7 | **Bulls Say / Bears Say** | narrative `bulls`/`bears` or generated | narrative |
| 8 | **Street View** (revisions, spread, targets, ratings mix, beat record) | `lib/street-view.ts` + `consensus-ledger.json` | a ledger capture each time |
| 9 | **Ownership and Positioning** | `lib/ownership.ts` + `ownership.json` + library mentions | 13F capture (by the capture script) |
| 10 | **Quant Rating and Peer Comparison** | `lib/research-peers.ts` | none (peer rows in the snapshot) |
| 11 | **Economic Moat** | narrative `moat` or generated | narrative |
| 12 | **Fair Value and Profit Drivers** + DCF inputs + the models + bull/bear cases + sensitivity | narrative `fairValue` or generated; `research-valuation.ts`; `sensitivity.tsx` | narrative |
| 13 | **Valuation History** (multiples vs own record, drawdowns, earnings reactions) | `lib/valuation-history.ts` + `history/<SYM>.json` | none (capture script writes the history) |
| 14 | **Risk and Uncertainty** + what the company changed in its risk factors | narrative `risk` or generated; `lib/risk-factors.ts` | narrative; risk-factor review |
| 15 | **Management's Record** (guidance vs delivered, pay goals) | `lib/guidance.ts` | guidance records, pay record |
| 16 | **Capital Allocation** | narrative `capital` or generated | narrative |
| 17 | **Dividend** (payers only) | dividend module | none |
| 18 | **Shariah Compliance** | quick screen, or `shariah-issuers.ts` record | issuer record (optional, long) |
| 19 | **Our Record and Signposts** | `lib/signposts.ts` + editions + history | none (reads the edition) |
| 20 | **Financials**, **Research Methodology** | code | none |

**A company with only a snapshot** gets a complete, honest report: every
"code" row, generated prose in place of the narrative, the quick Shariah
screen, and no debates, events, guidance or industry tables (those sections
hide or say what is missing). The written records are what lift it to the
AAPL/NVDA standard.

---

## 3. The rules

### 3.1 Numbers
1. **The model is given numbers and writes prose; it is never asked for a
   number.** Every figure in the narrative must appear verbatim in the brief
   (`buildBrief` in `web/src/lib/narrative.ts`), in the form the page prints it
   (`43%`, not `43.0%`). `tests/narrative-figures.test.ts` enforces it, and the
   page drops a section at load if it cites a figure or a rating the page no
   longer shows.
2. **Ratings are computed, never written.** Quant verdict, letter and score,
   moat, uncertainty, capital allocation, valuation zone and fair value come
   from `researchRatings`. Prose explains them and may not contradict them.
3. **"Compound" means a true base-to-target CAGR** (`revenueCompound`,
   `epsCompound` in the brief). The forecast's median year-on-year step is not
   a compound rate and must not be called one (`compoundMisuse`).
4. **Fair values never touch a grade.** Price multiples are inside the quant
   rating's Valuation factor; no fair value estimate is.
5. **Hand-written records** (debates, guidance, pay, industry, events, risk
   review) may carry numbers only from a named primary source: the filing, the
   call, the company's release, the researcher's own press release. Never from
   coverage of it (one outlet put Apple's Q2 2026 phone shipments at 46.4
   million; IDC's own table says 55.8 million).
6. **Prefer a labelled, banded estimate to "unknown"** where the method allows
   one, and test the verdict at both ends of the band.

### 3.2 Quotes
1. Verbatim, at most **35 words** (outside voices, debates, events), **25**
   (call reading), **15** (risk-factor quotes). Any cut is marked with "…".
2. Attributed to a named person or firm, with role, source and date; linked to
   the publisher wherever a public copy exists (a library letter links through
   its library entry, `letterId`).
3. A sell-side analyst's question is a **concern raised**, never a rating.
4. Checked against the source before it ships: `tools/research/check_quotes.py`
   for transcripts and letters; save a web page's text into the sources folder
   for anything else.
5. Transcripts, letters and licensed research are the owners' copyright: keep
   them in git-ignored work folders, never in the app.

### 3.3 What is ours, and saying so
1. Every judgement is ours and labelled: a debate's "what our figures say",
   a voice's `note`, an event party's `why`, a risk change's `what`, a letter
   mention's `stance` and `view`, an industry table's `reading`. The words are
   ours; the quotes are theirs.
2. Our readings state no number that will move (the page prints the live
   figures beside them).
3. Unvalidated weights (the Alpha Signal) are said to be unvalidated.
4. Nothing is investment advice; nothing predicts a price.

### 3.4 Sources and access
1. **Primary first**: SEC filings, the company's own releases and call, then
   structured market data. News is context, never a fact about the business.
   No social media.
2. **Provider hidden**: readers never see the market-data vendor's name, an
   API, or a key. Researchers (IDC, TrendForce) and fund firms are named,
   because their words are quoted.
3. **Licensed reports** (Morningstar, broker PDFs, paid trackers) set the
   format only; their content never enters the repository.
4. **SEC_USER_AGENT** must carry a real contact the user sets themselves;
   never the user's email chosen by us, never the placeholder. Until it is set,
   read sec.gov pages through WebFetch or the app's browser.
5. Crawlers honour robots.txt, skip bot-check and paywall pages (and say so),
   and keep DNS lookups to 64 threads or fewer.

---

## 4. The procedure, phase by phase

### 4.1 Phase 1 — data

| Step | Command | Writes |
|---|---|---|
| Snapshot, live key | `FMP_API_KEY=... python tools/research/capture_snapshot.py live {SYMBOL}` | `web/public/data/{SYMBOL}.json`, `history/{SYMBOL}.json`, `ownership.json` |
| Snapshot, no key | call every endpoint in section 6 through the connector, then `python tools/research/recover_connector.py tools/research/work/{SYMBOL}/replies` and `python tools/research/capture_snapshot.py dir {SYMBOL} tools/research/work/{SYMBOL}/replies` | the same three |
| Snapshot, from the app | open the report with the hidden `?apikey=` link, Settings → Save snapshot, save as `web/public/data/{SYMBOL}.json` | the snapshot only (history and ownership still need the script) |
| Consensus ledger | `python tools/capture/consensus_ledger.py live {SYMBOL}` (key) or `fold {SYMBOL} YYYY-MM-DD --estimates ... --target ... --grades ... --price ...` (replies) | `consensus-ledger.json` |
| Ledger from an older snapshot (starts the revision history) | `python tools/capture/consensus_ledger.py snapshot {SYMBOL} YYYY-MM-DD path/to/{SYMBOL}.json` | `consensus-ledger.json` |
| Reported quarters (only when the snapshot carries no `earnings` feed) | add the `earnings-company` reply's rows by hand to the ledger's `reported` block (`"{SYMBOL}": { date, rows }`); Street View reads them | `consensus-ledger.json` |

Notes:
- **Earnings feed.** A company with an edition on record is captured without
  `earnings` (it would rate `peNonGaapTtm` and move the graded quant score);
  a new company is captured `--with-earnings`.
- **Quote vs price history.** Check the snapshot's `quote.price` and
  `facts.quoteTime` against the last close in `prices`. AAPL's quote is
  21 Aug 2026 while its prices run to 9 Oct: the report then prints a stale
  price. Refresh the quote with the prices.
- The snapshot is served to readers: no provider name in its `note`.

### 4.2 Phase 2 — primary sources

| Source | How | For |
|---|---|---|
| Last 6 call transcripts | connector `search-transcripts` (symbol, fiscal year, quarter; dates from `transcriptDates`), then `recover_connector.py` and `python tools/research/transcripts_to_txt.py <replies> tools/research/work/{SYMBOL}/calls` | voices, debates, guidance, call reading, earnings note |
| 10-K this year and last | EDGAR (`secFilings` in the snapshot gives the links); `python tools/corpus/risk_factors.py NEW.htm OLD.htm` | risk-factor review, Shariah record |
| Latest DEF 14A | EDGAR; read the Compensation Discussion and Analysis | pay record |
| Latest 10-Q, 8-Ks and EX-99 releases | EDGAR; `python tools/events/follow.py URL ... --symbols {SYMBOL}` | events, deal terms |
| Company releases and blog | the company's own site; `follow.py` stores primary text in the corpus | events, voices |
| Market share and forecasts | the researcher's **own free press release** (IDC, TrendForce, Canalys, Counterpoint, Jon Peddie); copy only the headline table | industry tables |
| Fund letters and outlooks | `python tools/letters/scan_mentions.py fetch` then `scan --ticker {SYMBOL}`; read every passage | voices, debates, letter mentions |
| Firms' public house views | `houseViews` in `lib/firm-views.ts` (library) | firm views (automatic) |

### 4.3 Phase 3 — the records, in order

1. **Narrative.** `cd web && BRIEF={SYMBOL} npx vitest run tests/narrative-brief.tool.test.ts`
   writes `tools/narrative/work/{SYMBOL}-prompt.json`: `system`, `user` (task +
   brief) and `basis`. Write the JSON exactly as `TASK` asks (note, strategy,
   bulls, bears, moat, fairValue, risk, capital), obeying `SYSTEM`'s absolute
   rules and style (paragraphs of 60–110 words, first person plural, no
   markdown, none of "delve", "leverage" as a verb, "robust", "landscape").
   Save it under `{SYMBOL}` in `web/public/data/research.json` with `model`,
   `generatedAt` and `basis` (price, fair value, quant rating as the page prints
   them, and a note of what it was written from). Keep each section's paragraph
   count stable once voices are anchored to it.
2. **Edition.** Add an `Edition` to `EDITIONS` in `web/src/lib/research-editions.ts`
   with the page's readings (price, fair value, models, zone, quant verdict,
   letter and score, factor scores, moat, uncertainty, capital), the headline,
   the triggers, and for a later edition `changed`: what moved and why, in our
   words. `tests/research-editions.test.ts` pins the latest edition to the
   bundled page reading: **record a new edition whenever the model moves a
   rating.**
3. **Outside voices** (`web/src/lib/research-voices.ts`): 10–25 quotes from
   management, analysts' questions, fund letters, research and competitors,
   each `confirms`, `challenges` or `adds` to the paragraph it is anchored
   under (`after`: a narrative paragraph index, or a quant key: `lead`,
   `factors`, `valuation`, `profitability`, `growth`, `health`, `closing`), with
   one sentence of ours in `note`.
4. **Key Debates** (`web/src/lib/debates.ts`): the four questions that decide the
   value. Each with a reader's question, a short map label, why it matters,
   `measure` (`growth`, `margin` or `null`: which reverse-DCF reading the price
   row uses), bull and bear evidence (quotes as above, each with a `point` of
   ours), `ours` (side + text, no moving numbers), what would settle it, and the
   next dated test (`date: 'next'` uses the earnings calendar). Reuse verified
   voices where they fit.
5. **Recent Developments** (`web/src/lib/events.ts`, see `tools/events/README.md`):
   one `CorpEvent` per material event since the last 10-K, confidence stated,
   every fact sourced, vendor claims apart, every party read from its own side.
6. **Risk-factor review** (`web/src/lib/risk-factors.ts`): `risk_factors.py` counts
   and sentence changes; we choose which changes matter and write `what`;
   quotes at most 15 words; check the split's count against the filing.
7. **Management's Record** (`web/src/lib/guidance.ts`): from the last six calls,
   each quarter's outlook (revenue as a range, level ±% or growth range; words
   such as "low to mid single digits" banded and marked `ours`; gross margin
   range, with its basis) against the filed result; a one-off the company
   named goes in `marginNote` and `marginUnderlying`; the pending quarter with
   `reportedOn: null` (and `base` for a growth guide). From the DEF 14A, the
   annual award's goals, thresholds, maxima, results and payouts verbatim, the
   prior-year figure from the filings, and the long-term award in a sentence.
8. **Industry tables** (`web/src/lib/industry.ts`): one `MarketRecord` per market
   that matters, copied from the researcher's own release (rows must add to
   100%), `preliminary` as the publisher says, a later revision in `update`,
   and a `reading` of ours tied to a debate id.
9. **Call reading** (`public/data/management-voice.json`):
   `cd web && VOICE_CALLS=../tools/research/work/{SYMBOL}/calls VOICE_WRITE=1 VOICE_MERGE=1 npx vitest run tests/management-voice.test.ts`.
   Reads the newest two calls by fixed rules; keeps scores and quotes of at
   most 25 words.
10. **Letter mentions** (`web/src/lib/letters.ts`): for each library document
    that discusses the company, a `Mention` with action, `stance` (the
    document's lean, not the trade) and a `view` of ours (never a quote).
11. **Shariah issuer record** (optional; `web/src/lib/shariah-issuers.ts`, method
    in the v5.0 master at the repository root): a full screen from the
    filings; AI-extracted impure-income lines are drafts a person approves.

Each record's exact shape is in section 5.

### 4.4 Phase 4 — fact-check (see section 7)

---

## 5. Record templates

```ts
// research-editions.ts
{ symbol: 'XYZ', date: '2026-10-17', dataAsOf: '2026-10-16', triggers: ['initiation'],
  headline: 'Xyz …',                       // the Analyst Note's headline that day
  price: 0, fairValue: 0, models: 10, zone: 'Fairly valued',
  quant: { verdict: 'Hold', letter: 'B', score: 0 },
  factors: { valuation: 0, growth: 0, profitability: 0, health: 0, momentum: 0 },
  moat: 'Wide', uncertainty: 'Medium', capital: 'Standard',
  changed: '…' }                           // later editions only: what moved and why, ours

// research-voices.ts
{ symbol: 'XYZ', section: 'moat', after: 1, kind: 'letter', relation: 'confirms',
  quote: '…', speaker: 'Name', role: 'Role, Firm', source: 'Document or call', date: '2026-07-30',
  letterId: 'library-id' /* or url: 'https://…' */, note: 'Ours: why it sits here.' }

// debates.ts
{ symbol: 'XYZ', id: 'xyz-growth', short: 'Growth', question: '…?', why: '…', measure: 'growth',
  evidence: [
    { side: 'bull', kind: 'management', speaker: '…', role: '…', source: 'Q3 fiscal 2026 earnings call',
      date: '2026-07-30', quote: '…', point: 'Ours, one line.' },
    { side: 'bear', kind: 'analyst', /* … */ },
  ],
  ours: { side: 'mixed', text: 'What our figures show; no number that moves.' },
  settle: 'The evidence that would settle it.',
  next: { what: 'Fiscal fourth-quarter results', date: 'next', basis: 'the expected date in the earnings calendar' } }

// guidance.ts
{ symbol: 'XYZ', quarter: 'Q3 FY2026', guidedOn: '2026-05-20', reportedOn: '2026-08-26', revenueKind: 'level',
  revenue: pm2(91.0), revenueActual: 96.221, margin: pm50(0.75), marginActual: 0.75 }
{ symbol: 'XYZ', quarter: 'June quarter FY2025', guidedOn: '2025-05-01', reportedOn: '2025-07-31', revenueKind: 'growth',
  revenue: { low: 0.01, high: 0.05, words: 'low to mid-single digits', ours: true }, revenueActual: 94.036 / 85.777 - 1,
  margin: { low: 0.455, high: 0.465 }, marginActual: 0.465 }
// PAY: { symbol, year, source, url, filed, goals: [{ plan, metric, threshold, target, maximum, actual, payout, priorYear, unit, note? }], longTerm }

// industry.ts
{ symbol: 'XYZ', id: 'xyz-market-2q26', market: '…, worldwide', period: 'Q2 2026 (calendar)',
  publisher: 'IDC', title: 'the release headline, verbatim', date: '2026-07-13', url: '…', preliminary: true,
  unit: 'million units', rows: [{ name, units, share, unitsYearAgo, shareYearAgo, growth }], total: { units, unitsYearAgo, growth },
  reading: 'Ours.', debate: 'xyz-growth' }

// events.ts — CorpEvent: id, date, announced?, kind, confidence, title, summary (ours), facts [{label, value, source}],
// claims? [{claim, by, basis, source}], deal?, parties [{name, symbol?, role, why}], sources [{kind, publisher, title, date, url}],
// quotes? [{text, speaker, role, org?, source}]

// risk-factors.ts — RiskFactorReview: symbol, readOn, current/previous {fiscalYear, periodEnd, filed, url, count},
// counts {sameHeading, reworded, added, dropped}, summary (ours), changes [{kind, group, subject, what, quote?}]
```

---

## 6. Connector calls, for the no-key path

Call each for `{SYMBOL}` and save with `recover_connector.py`; the capture
script maps them to feeds by name. Peers: the first eight from `peers`, each
with `metrics-ratios-ttm`, `key-metrics-ttm` and `financial-statement-growth`.
Benchmarks: `historical-price-eod-light` for SPY and the sector fund
(`SECTOR_ETF` in `web/src/lib/nav.ts`).

| Connector tool → endpoint (params) | Feed |
|---|---|
| quote → `quote` | quote |
| company → `profile-symbol`, `peers`, `company-executives`, `executive-compensation`, `historical-employee-count`, `shares-float`, `historical-market-cap` | profile, peers, executives, execComp, employees, sharesFloat, marketCapHist |
| statements → `income-statement` / `balance-sheet-statement` / `cashflow-statement` (period annual, limit 10; quarter, limit 12 for income and cash flow) | income, balance, cashflow, incomeQ, cashflowQ |
| statements → `metrics-ratios`, `key-metrics` (annual, 10), `metrics-ratios-ttm`, `key-metrics-ttm`, `financial-scores`, `financial-statement-growth`, `owner-earnings`, `revenue-product-segmentation` (annual and quarter), `revenue-geographic-segments` | ratiosHist, metricsHist, ratiosTtm, metricsTtm, scores, growth, ownerEarnings, segProduct, segProductQ, segGeography |
| analyst → `financial-estimates` (annual), `price-target-consensus`, `grades-summary`, `historical-grades` (24), `price-target-summary`, `ratings-snapshot`, `grades` | estimates, priceTarget, grades, gradesHistorical, targetSummary, ratings, gradeActions |
| discountedCashFlow → levered DCF (save as `dcfLevered.json`) | dcfLevered |
| chart → `historical-price-eod-light` (ten years) | prices + history |
| calendar → `earnings-company`, `dividends-company` | earnings (new companies only), dividends |
| insiderTrades → `insider-trade-statistics`, `search-insider-trades` | insiderStats, insiderTrades |
| form13F → `positions-summary`, `filings-extract-with-analytics-by-holder` (last complete quarter: 47 days after quarter end) | holdersSummary, institutional + ownership.json |
| news → `search-stock-news`, `search-press-releases` | news, pressReleases |
| earningsTranscript → `transcripts-dates-by-symbol`, `search-transcripts` (last 6) | transcriptDates; calls for phase 2 |

---

## 7. Fact-check: done means all of this passes

1. `cd web && npx tsc --noEmit -p . && npx vitest run` — all green. The tests
   that guard the Research tab: `narrative-figures`, `research-editions`,
   `research-voices`, `research-perspectives`, `events`, `risk-factors`,
   `research-valuation`, `research-peers`, `generated-prose`, `management-voice`.
2. `python tools/research/check_quotes.py web/src/lib/debates.ts web/src/lib/research-voices.ts web/src/lib/events.ts --sources tools/research/work/{SYMBOL} tools/letters/work/text`
   — zero missing, or each missing one opened at its URL and confirmed by hand.
3. Every hand-written number traced to its primary source (guidance to the
   call and the filed quarter; pay to the DEF 14A; shares to the researcher's
   release; deal terms to the 8-K). Recompute anything derived.
4. Every "ours" sentence checked against the figures on the page (e.g. "return
   on capital leads the peer set": open the peer table).
5. The page in the browser (`preview_start` with `mazvantage-web-3001`), at
   `/stock/{SYMBOL}/research`: every section renders, no console errors, the
   narrative's sections are not dropped as stale (Methodology says which, if
   any), Contents matches the sections, print preview works.
6. The edition's readings equal the page's; the price used equals the close
   on the edition's date (Our Record and Signposts shows both).
7. Report: what was built, what was verified, what was corrected, what is
   open. Do not commit unless asked.

---

## 8. Traps learned the hard way

- **Stale quote.** A snapshot can carry a quote older than its prices; the
  whole report then prints the old price. Refresh both together.
- **The earnings feed moves the quant rating** (`peNonGaapTtm`). Add it only to
  a new company, or record a new edition.
- **Narrative figures** must be in the form the page prints (`43%`, not
  `43.0%`); a median step is not a compound rate; keep paragraph counts when
  voices are anchored.
- **Secondary outlets misquote trackers.** Copy only from the publisher's page.
- **13F filer numbers change** (Vanguard re-registered in 2026): no prior
  filing under a number is not a purchase. One extract row matched another
  filer's share count exactly: a data error, so rank by value and read the top
  ten only.
- **Transcripts garble figures** ("74.875%" for "74.8% and 75%"): note the
  reading in the record.
- **Call speakers**: analysts are found by the operator's introduction; files
  written on Windows are CRLF.
- **Guide words** ("mid- to high single digits") are banded by us and say so.
- **Pay targets near the prior year** are a finding, not an error: show the
  prior-year column.
- **Bash heredocs mangle backslashes** in this environment: write scripts with
  the editor, not `cat <<EOF`.
- **Port 3000** is often another session's server: use `mazvantage-web-3001`.
- **Name collisions** in crawls: require the firm's descriptor in the title or
  domain, then read the survivors.

---

## 9. Cost and time, for planning

- Per company, in a session: about 2–4 hours of reading and writing for the
  full set of records; the snapshot alone takes minutes.
- Automated through the API (from the per-quarter estimate for 5,000 runs): the
  narrative on Claude Opus 5.5 is about $0.26 a company at standard rates,
  $0.13 batched; the call summary and reading on Claude Sonnet 5.5 about
  $0.07; the Shariah filing read about $0.34. The written records (debates,
  guidance, pay, events) are research, not generation, and still want a person
  to approve them.
