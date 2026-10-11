"""
Maz Vantage — the document corpus: search and read.

    python tools/corpus/search.py stats
    python tools/corpus/search.py find AAPL "interest income" [--kind 10-K] [--since 2025-01-01] [-n 15]
    python tools/corpus/search.py show "edgar:0000320193-25-000079:aapl-20250927.htm#183342"
    python tools/corpus/search.py doc  "edgar:0000320193-25-000079:aapl-20250927.htm" [--from 40 --to 60]

`find` takes FTS5 syntax: "exact phrase", OR, NEAR(a b, 10), prefix*.
Results are ranked by BM25 and print the chunk id — the citation a
reading or a report sentence carries.
"""
import argparse
import sys

from store import connect

sys.stdout.reconfigure(encoding='utf-8')


def stats(db):
    for r in db.execute("""SELECT d.symbol, d.kind, COUNT(DISTINCT d.doc_id) docs, COUNT(c.chunk_id) chunks,
                                  MIN(d.published_at) first, MAX(d.published_at) last, SUM(LENGTH(c.text)) chars
                           FROM documents d JOIN chunks c USING (doc_id) GROUP BY 1, 2 ORDER BY 1, 3 DESC"""):
        print(f"{r['symbol']:<6}{r['kind']:<10}{r['docs']:>5} docs {r['chunks']:>6} chunks {r['chars'] / 1e6:>6.2f}M chars  {r['first']} → {r['last']}")


def find(db, symbol, q, kind=None, since=None, n=15):
    sql = """SELECT f.chunk_id, d.kind, d.published_at, d.period, c.heading,
                    snippet(chunks_fts, 2, '[', ']', ' … ', 24) snip
             FROM chunks_fts f JOIN chunks c ON c.chunk_id = f.chunk_id JOIN documents d ON d.doc_id = c.doc_id
             WHERE chunks_fts MATCH ? AND d.symbol = ?"""
    args = [q, symbol.upper()]
    if kind:
        sql += ' AND d.kind = ?'
        args.append(kind)
    if since:
        sql += ' AND d.published_at >= ?'
        args.append(since)
    sql += ' ORDER BY bm25(chunks_fts) LIMIT ?'
    args.append(n)
    for r in db.execute(sql, args):
        print(f"{r['published_at']} {r['kind']:<8} {r['chunk_id']}\n    {(r['heading'] or '')[:90]}\n    {r['snip']}\n")


def show(db, cid):
    r = db.execute("""SELECT c.*, d.kind, d.published_at, d.period, d.url FROM chunks c JOIN documents d USING (doc_id)
                      WHERE chunk_id = ?""", (cid,)).fetchone()
    if not r:
        raise SystemExit('no such chunk')
    print(f"{r['kind']} filed {r['published_at']} (period {r['period']}) · seq {r['seq']} · {r['url']}\n{r['heading'] or ''}\n\n{r['text']}")


def doc(db, did, lo, hi):
    for r in db.execute('SELECT * FROM chunks WHERE doc_id = ? AND seq BETWEEN ? AND ? ORDER BY seq', (did, lo, hi)):
        print(f"--- #{r['seq']} {r['chunk_id']} · {r['heading'] or ''}\n{r['text']}\n")


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    sp.add_parser('stats')
    f = sp.add_parser('find')
    f.add_argument('symbol')
    f.add_argument('query')
    f.add_argument('--kind')
    f.add_argument('--since')
    f.add_argument('-n', type=int, default=15)
    s = sp.add_parser('show')
    s.add_argument('chunk_id')
    d = sp.add_parser('doc')
    d.add_argument('doc_id')
    d.add_argument('--from', dest='lo', type=int, default=0)
    d.add_argument('--to', dest='hi', type=int, default=10 ** 6)
    a = ap.parse_args()
    db = connect()
    if a.cmd == 'stats':
        stats(db)
    elif a.cmd == 'find':
        find(db, a.symbol, a.query, a.kind, a.since, a.n)
    elif a.cmd == 'show':
        show(db, a.chunk_id)
    else:
        doc(db, a.doc_id, a.lo, a.hi)


if __name__ == '__main__':
    main()
