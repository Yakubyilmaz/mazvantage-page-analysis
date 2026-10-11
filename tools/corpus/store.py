"""
Maz Vantage — the document corpus: the SQLite store.

Two tables and a full-text index:

  documents  one row per document: who, what kind, when it was published
             (the date every point-in-time signal must respect), where it
             came from, and when we fetched it
  chunks     the document's text in paragraph-aligned pieces, each with its
             heading and character offset
  chunks_fts FTS5 over chunk text and heading (porter stemming)

The file lives in the git-ignored work/ folder: it is rebuilt from the
sources, never edited by hand.
"""
import sqlite3
from datetime import datetime, timezone

from common import DB, WORK

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
  doc_id       TEXT PRIMARY KEY,   -- e.g. edgar:0000320193-25-000079:aapl-20250927.htm
  symbol       TEXT NOT NULL,
  source       TEXT NOT NULL,      -- edgar | transcript | letter | news
  kind         TEXT NOT NULL,      -- 10-K, 10-Q, 8-K, EX-99.1, EX-21.1, DEF 14A, transcript ...
  title        TEXT,
  published_at TEXT NOT NULL,      -- filing / publication date, ISO
  period       TEXT,               -- the period the document reports on, ISO
  url          TEXT,
  fetched_at   TEXT NOT NULL,
  chars        INTEGER
);
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id TEXT PRIMARY KEY,       -- doc_id#offset
  doc_id   TEXT NOT NULL REFERENCES documents(doc_id),
  seq      INTEGER NOT NULL,
  offset   INTEGER NOT NULL,
  heading  TEXT,
  text     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc_id, seq);
CREATE INDEX IF NOT EXISTS docs_sym ON documents(symbol, published_at);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED, heading, text, tokenize = 'porter unicode61'
);
"""


def connect():
    WORK.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db


def has_doc(db, doc_id):
    return db.execute('SELECT 1 FROM documents WHERE doc_id = ?', (doc_id,)).fetchone() is not None


def put(db, doc, pieces):
    """Replace one document and its chunks. `pieces` is [(heading, offset, text)]."""
    did = doc['doc_id']
    old = [r[0] for r in db.execute('SELECT chunk_id FROM chunks WHERE doc_id = ?', (did,))]
    if old:
        db.executemany('DELETE FROM chunks_fts WHERE chunk_id = ?', [(c,) for c in old])
        db.execute('DELETE FROM chunks WHERE doc_id = ?', (did,))
    db.execute('DELETE FROM documents WHERE doc_id = ?', (did,))
    db.execute(
        'INSERT INTO documents VALUES (:doc_id, :symbol, :source, :kind, :title, :published_at, :period, :url, :fetched_at, :chars)',
        {**doc, 'fetched_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
         'chars': sum(len(t) for _, _, t in pieces)})
    rows = [(f'{did}#{off}', did, i, off, h, t) for i, (h, off, t) in enumerate(pieces)]
    db.executemany('INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?)', rows)
    db.executemany('INSERT INTO chunks_fts VALUES (?, ?, ?)', [(r[0], r[4], r[5]) for r in rows])
    db.commit()
