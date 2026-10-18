// node tools/research/mcap_windows.js REPLIES_DIR SYM... — month-end market-cap averages (§6): trailing 12, 24, 36 complete months, plus the latest spot.
// Reads historical-market-cap_<SYM>.json saved by recover_connector.py. SERIES=1 also prints the month-ends.
const fs = require('fs');
const path = require('path');
const [dir, ...syms] = process.argv.slice(2);
for (const sym of syms) {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, `historical-market-cap_${sym}.json`), 'utf8'))
    .map((r) => ({ date: r.date, v: r.marketCap / 1e6 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const spot = rows[rows.length - 1];
  const lastMonth = spot.date.slice(0, 7); // the current, incomplete month is left out
  const ends = new Map();
  for (const r of rows) { const m = r.date.slice(0, 7); if (m < lastMonth) ends.set(m, r); }
  const months = [...ends.keys()].sort();
  const avg = (n) => { const xs = months.slice(-n).map((m) => ends.get(m).v); return xs.length === n ? Math.round(xs.reduce((a, b) => a + b, 0) / n) : null; };
  const series = months.slice(-36).map((m) => `${m}:${Math.round(ends.get(m).v)}`);
  console.log(JSON.stringify({ sym, m12: avg(12), m24: avg(24), m36: avg(36), spot: Math.round(spot.v), spotDate: spot.date, first: months[months.length - 36], last: months[months.length - 1] }));
  if (process.env.SERIES) console.log(series.join(' '));
}
