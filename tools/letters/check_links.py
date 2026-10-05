#!/usr/bin/env python3
"""
Maz Vantage — Letters & Outlooks: re-open every link in the library.

    python tools/letters/check_links.py

Reads every `url:` and `pdf:` in web/src/lib/letters.ts and letters-index.ts,
opens each once (robots.txt honoured, eight at a time) and lists the ones that
no longer answer. Publishers move and delete documents; run this before
trusting the library's "checked" date, and fix or remove what it reports.

Three kinds of failure, kept apart because they mean different things:
  dead      404 / 410 / no such host — the document has gone
  slow      no answer within 90 seconds, twice — try again later or in a browser
  blocked   401 / 403 / 429 / robots — the site refuses scripts; open it in a
            browser before removing anything (IMF, UBS, Schwab and OECD do this)
"""
import concurrent.futures as cf
import os
import re
import sys
import urllib.error

from common import get

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LIB = [os.path.join(ROOT, 'web', 'src', 'lib', f) for f in ('letters.ts', 'letters-index.ts')]


def check(url):
    for timeout in (30, 90):  # some publishers answer slowly; one patient retry before calling it
        try:
            st, final, _, _ = get(url, limit=200_000, timeout=timeout)
            return url, 'ok' if st == 200 else 'dead', str(st)
        except PermissionError:
            return url, 'blocked', 'robots.txt'
        except urllib.error.HTTPError as e:
            return url, 'blocked' if e.code in (401, 403, 429) else 'dead', str(e.code)
        except (TimeoutError, OSError) as e:
            if timeout == 90 or isinstance(e, urllib.error.URLError) and 'getaddrinfo' in str(e):
                return url, 'slow' if isinstance(e, TimeoutError) or 'timed out' in str(e) else 'dead', type(e).__name__
        except Exception as e:
            return url, 'dead', type(e).__name__
    return url, 'slow', 'timeout'


def main():
    urls = []
    for path in LIB:
        for u in re.findall(r'(?:url|pdf): ["\']([^"\']+)["\']', open(path, encoding='utf-8').read()):
            if u not in urls:
                urls.append(u)
    print(f'opening {len(urls)} links', flush=True)
    bad = []
    with cf.ThreadPoolExecutor(8) as ex:
        for url, verdict, detail in ex.map(check, urls):
            if verdict != 'ok':
                bad.append((verdict, detail, url))
    for verdict in ('dead', 'slow', 'blocked'):
        rows = [b for b in bad if b[0] == verdict]
        print(f'\n{verdict}: {len(rows)}')
        for _, detail, url in rows:
            print(f'  {detail:<14} {url}')
    print(f'\n{len(urls) - len(bad)} of {len(urls)} answered')
    sys.exit(1 if any(b[0] == 'dead' for b in bad) else 0)


if __name__ == '__main__':
    main()
