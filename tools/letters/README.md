# Letters & Outlooks tools

Keep `/research/letters` growing and current. The page links to documents on
the publishers' own sites; these scripts find new ones there and check the old
ones still answer. Standard library only (Python 3.10+). `pdftotext` (poppler)
is used when it is on `PATH` to read a PDF's first page; without it a PDF needs
a date on the page that links to it.

| Script | Does |
|---|---|
| `crawl.py names.txt` | firm name → its own website → its letters/insights page → recent documents, each opened for title and date |
| `review.py` | applies the checks, drops what the library already has, writes `work/review.txt` and paste-ready `work/new-entries.ts` |
| `check_links.py` | re-opens every link in the library; lists the dead and the blocked |
| `quality.py`, `common.py` | the same-company check, the document filters, polite HTTP, dates |

`work/` is git-ignored: names files, crawl state and output stay local.

## Adding firms

1. **Write a names file**, one firm per line (`Smead Capital Management`,
   `Bridgewater Associates`…). Names only — never another service's letters,
   summaries, counts, tags or links. A public list of names is fine as a
   starting point; the documents must come from each firm's own site.
2. **Crawl:** `python tools/letters/crawl.py names.txt` (add `--since 2026-07-01`
   for a narrower window; the default is the last nine months). It resumes:
   `--stage docs` reruns only the last step. Expect about an hour for 700 names.
3. **Review:** `python tools/letters/review.py`, then **read `work/review.txt`**.
   Strike any firm that is a different company with a similar name by adding
   its name to `work/deny.txt`, and rerun `review.py`.
4. **Paste** `work/new-entries.ts` at the end of `INDEX_FIRMS` and
   `INDEX_LETTERS` in `web/src/lib/letters-index.ts`, move `CHECKED` in
   `letters.ts` to today, and run `npm test` in `web/` (the letters suite
   checks vocabulary, dates, unique addresses and the crawled-entry rules).

## What to expect, from the first run (2026-10-05)

775 names → 655 with an address → 403 sites that mention the firm → 172
passing the same-company check → 61 firms with a dated document → 184
documents, after eight firms were struck by hand (and one webcast later).

- **Same-name companies are the main failure.** A shared word matched a hotel
  group, a property lawyer, a Bitcoin exchange, accounting software. The check
  in `quality.py` (the firm's own descriptor must be in the page title or the
  address) removes most; the human read removes the rest.
- **Script-built sites yield nothing.** If the letters only appear after the
  page's JavaScript runs, the crawler cannot see them. Those firms need a
  browser or a hand-written entry.
- **Dates:** the date a reader sees on the listing beats page metadata, which
  is often a template's creation date. Nothing undated is kept.
- **Lookups:** at most 48 at a time. A burst of 160 once made the Windows
  resolver fail every lookup for about an hour; failed lookups are retried.
- **Politeness:** robots.txt is honoured, one firm's requests are spaced, and no
  site gets more than ~15 requests.

## Which documents discuss which companies

`mentions` used to come only from titles and trade lists, so a letter that
spends paragraphs on a company without trading it never reached that
company's page. `scan_mentions.py` reads each document's own text and lists the
passages that name a company on its watch list; a person reads them and writes
the mention by hand.

1. **Export the library** as the app holds it:
   `LETTERS_EXPORT=../tools/letters/work/library.json npx vitest run tests/letters.test.ts` (in `web/`).
2. **Fetch the text:** `python tools/letters/scan_mentions.py fetch` — every
   document once, robots.txt honoured, one request per site every two seconds,
   kept in `work/text/` (git-ignored; about 15 minutes for 350 documents).
3. **Scan:** `python tools/letters/scan_mentions.py scan [--ticker AAPL]` writes
   `work/mentions-scan.txt`, one block per document and company.
4. **Read and write.** Most hits are passing ("the Magnificent 7 are…"), false
   ("Apple Valley", "Apple Podcasts") or a firm naming itself. For the ones that
   say something, add a mention with a `stance` — which way the document leans
   on the company, not the trade: a fund can sell on success — and a `view`:
   one sentence of our own, never a quote. A crawled (`auto`) entry may carry a
   mention only with both; the letters suite checks it.

First run (2026-10-09): 337 of 352 documents read (UBS, the IMF and the OECD
refuse scripts; DWS pages build in the browser), 648 document–company pairs,
of which six discuss Apple.

## Keeping links alive

`python tools/letters/check_links.py` before a release. **Dead** (404, gone)
entries should be fixed or removed. **Blocked** (403, robots) means the site
refuses scripts — IMF, UBS, Schwab and OECD do — so open those in a browser
before removing anything.
