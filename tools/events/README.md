# Company events

One record per real-world event (a launch, a contract, a partnership), written
once and shown on the Research report of every company it touches, from that
company's side. The records live in `web/src/lib/events.ts`; the pilot is
NVIDIA's RTX Spark (N1X) launch with Microsoft, 7 October 2026.

## The pipeline

| Step | What | Where |
| --- | --- | --- |
| 1. Detect | Headlines tagged *Product, launch or contract*, *Merger or acquisition* or *Supply chain*; every release on a covered company's own channel or a wire, whatever its title; 8-K Item 1.01 / EX-99 filings | `web/src/lib/news-events.ts` (`eventStories`), news and press-release feeds, `tools/corpus/ingest_edgar.py` |
| 2. Follow | Fetch the URL. A company channel or a wire is **primary**: stored in full in the corpus. Anything else is **press**: title, date and link only, and its links are searched for a primary source to follow | `python tools/events/follow.py URL ... --symbols NVDA MSFT` |
| 3. Read | A person reads the primary text from the corpus and writes the record | `python tools/corpus/search.py find NVDA "RTX Spark"` |
| 4. Show | `eventsFor(symbol)` puts it in the report's **Recent Developments** section; a competitor's pointed line can also sit beside a paragraph as an outside voice | `research-tab.tsx`, `lib/research-voices.ts` |

`follow.py` uses the Letters crawler's fetch (robots.txt honoured, lookups
retried) and the corpus store. A page that answers with a bot check or a
paywall ("Pardon Our Interruption", "Just a moment") is skipped and said to
be, never stored as if it were the article.

## The record's rules (pinned in `web/tests/events.test.ts`)

- **Confidence is stated.** `confirmed`: a company announced it. `reported`:
  press only. `rumour`: unnamed sources. A confirmed event's facts all rest on
  primary sources.
- **Every fact names its source.**
- **Vendor claims are not facts.** "2.1x faster than a MacBook Pro" goes in
  `claims`, with the vendor's own basis ("Microsoft-commissioned testing on
  pre-production machines"), and the report says it is not tested here.
- **Every party reads it from its own side.** Maker, customer, design partner,
  co-developer, supplier, competitor, each with a paragraph of ours. A party
  without a US listing is named but not linked.
- **Two dates where there are two.** `announced` (first unveiled) and `date`
  (launched, signed). RTX Spark was unveiled 1 June and launched 7 October.
- **Quotes are short and exact**, at most 35 words, any cut marked "…".
- **Press is linked, not kept.** Primary text is stored in full; an article
  is a title and a link.

## Mergers and acquisitions

A deal is an event with `kind: 'acquisition'` and a `deal` block
(`DealTerms` in `events.ts`). Pilots: NVIDIA–Hugging Face (private target,
about US$12.9b) and HomeTrust–Blue Ridge (public target, all stock, about
US$448.1m).

- **Where the terms come from.** The 8-K (Item 1.01 when the parties call the
  agreement material; NVIDIA filed Hugging Face under Item 8.01, *other
  events*), its EX-99 press release and investor presentation, then the S-4
  or merger proxy. The market-data connector's merger-filing list names new
  S-4s with both tickers and the SEC link; a private target only reaches us
  through headlines and the buyer's own release.
- **A timeline, not a date.** `steps` run reported → agreed → filed →
  regulators / vote → closed (or terminated), each dated and sourced; the
  report shows the last one done. A press report before any confirmation is
  its own step, sourced to the press.
- **Ours, derived by `dealMath`:** premium over the last close before the
  news; a stock offer's value today at the acquirer's price; the spread to
  the target's price and that spread annualised to the expected close; the
  deal's size against the acquirer's market value on the signing date. The
  prices used are captured with their date in the record.
- **Theirs, kept as claims:** accretion, dilution and earn-back, cost savings.
- **Shariah, pro forma:** every deal carries a reading of what it does to each
  side's screen (a new business line, new debt, a stake to look through).

Detection: the tagger now reads "will buy" / "plans to acquire" as a deal and
sets the law firms' merger "investigations" (Halper Sadeh, Ademi…) aside as
advertising; both pinned in `web/tests/events.test.ts`.

## Known gaps

- The headline tagger misses a release written as a slogan ("NVIDIA and
  Microsoft Reinvent Windows PCs…"), so detection must also take every
  release from a company's channel. Pinned as a test.
- NVIDIA's and Microsoft's reports need their own data snapshots before the
  same event renders there; it renders on Apple's today.
- Step 3 is done by hand in a session. Once the record shape settles it can
  be drafted by a model over the corpus, and reviewed rather than written.
- Pages that need a browser to render (some newsrooms) come back thin; they
  are stored as fetched and should be checked.
- GlobeNewswire answers the crawler with 403. The same release is usually an
  EX-99.1 exhibit on the 8-K, which is the better source anyway, and
  downloading it needs `SEC_USER_AGENT` (see `tools/corpus/`).
- Prices in a deal record are a dated capture. The spread goes stale; refresh
  `latest` when the record is shown on a live page, or recapture.
- PDFs linked from a press article are skipped by `follow.py` for now.
