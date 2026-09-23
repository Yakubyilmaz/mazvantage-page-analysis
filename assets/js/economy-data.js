// Calendar actuals only: rates of different frequencies are never combined.
export function economyRates(releases, now = new Date()) {
  const maps = { gdp: {}, gdpQuarterly: {}, gdpAnnualized: {}, inflation: {} };
  for (const row of releases) {
    const event = String(row.event || '').trim();
    const metric = /^GDP(?: Growth Rate)? YoY\b/i.test(event) ? 'gdp'
      : /^GDP(?: Growth Rate)? QoQ\b/i.test(event) ? 'gdpQuarterly'
      : /^GDP Growth Annualized\b/i.test(event) ? 'gdpAnnualized'
      : /^(?:Inflation Rate|CPI) YoY\b/i.test(event) ? 'inflation' : null;
    const date = String(row.date || '').replace(' ', 'T');
    const stamp = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(date) ? date : `${date}Z`);
    if (!metric || !Number.isFinite(stamp) || stamp > +now || stamp < +now - 180 * 86400000) continue;
    if (row.actual == null || String(row.actual).trim() === '' || typeof row.actual === 'boolean') continue;
    const value = Number(row.actual);
    if (!Number.isFinite(value) || (row.unit && row.unit !== '%')) continue;
    let country = String(row.country || '').trim().toUpperCase();
    country = ({ USA: 'US', UK: 'GB', EL: 'GR' })[country] || country;
    if (!/^[A-Z]{2}$/.test(country) || country === 'EU') continue;
    const previous = maps[metric][country];
    if (previous && previous.stamp >= stamp) continue;
    maps[metric][country] = { country, value, date: row.date, event, stamp, unit: '%', basis: metric === 'gdpQuarterly' ? 'QoQ' : metric === 'gdpAnnualized' ? 'Annualized QoQ' : 'YoY' };
  }
  return maps;
}

/* ---------- one country's board, read off its own calendar -----------------

   FMP's indicator *series* are a United States dataset and the US board says
   so. What every country does have is this calendar: each row carries the
   actual, the print before it, the vendor's estimate and an impact rating. So
   a country's board is that calendar read as a board — the latest actual per
   series, the move against the previous print, and the earlier prints of the
   same series as its line. It costs no request: these are the rows the world
   maps already loaded.

   A release names its period in its own title — `Inflation Rate YoY (Aug)` —
   so the period is stripped to group the months of one series together. It is
   printed back on the card from the release date rather than kept in the name,
   which would give twelve cards where there is one series. */
const seriesName = (event) => String(event || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const IMPACT_RANK = { high: 0, medium: 1, low: 2 };
/* `Number(null)` is 0 and `Number('')` is 0, so a release the vendor published
   no forecast for printed a forecast of zero. Absent is absent. */
const estimateOf = (row) => {
  if (row.estimate == null || String(row.estimate).trim() === '' || typeof row.estimate === 'boolean') return null;
  const value = Number(row.estimate);
  return Number.isFinite(value) ? value : null;
};
const parsed = (date) => {
  const text = String(date || '').replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}Z`);
};

/**
 * The indicator board for one country: the newest reported actual for each
 * series it published, most consequential first.
 *
 * `codes` is the country's own list of the spellings this vendor uses for it.
 * Ranking is the vendor's `impact`, not this app's opinion of what matters,
 * and recency breaks the tie — which is also what keeps bond auctions and
 * other low-impact daily rows below a country's rate decision.
 */
export function countryReleases(releases, codes = [], limit = 12) {
  const wanted = codes.map((code) => String(code).toUpperCase());
  const series = new Map();
  for (const row of releases) {
    const country = String(row.country || '').trim().toUpperCase();
    const name = seriesName(row.event);
    const value = row.actual == null || String(row.actual).trim() === '' || typeof row.actual === 'boolean'
      ? null : Number(row.actual);
    const stamp = parsed(row.date);
    if (!wanted.includes(country) || !name || value == null || !Number.isFinite(value) || !Number.isFinite(stamp)) continue;
    const entry = series.get(name) || { event: name, country, points: [], seen: new Set() };
    // A window fetched twice, or a row the vendor repeats, must not become a
    // second observation: that would draw a flat step on the line and report a
    // move of zero against a release that is the same release.
    if (entry.seen.has(stamp)) continue;
    entry.seen.add(stamp);
    entry.points.push({ date: row.date, value, stamp, estimate: estimateOf(row),
      unit: row.unit || '', impact: String(row.impact || '').toLowerCase() });
    series.set(name, entry);
  }
  return [...series.values()].map(({ seen, ...entry }) => {
    const points = entry.points.sort((a, b) => a.stamp - b.stamp);
    const latest = points[points.length - 1];
    return { ...entry, points, latest, previous: points[points.length - 2] || null, unit: latest.unit, impact: latest.impact };
  }).sort((a, b) => (IMPACT_RANK[a.impact] ?? 3) - (IMPACT_RANK[b.impact] ?? 3) || b.latest.stamp - a.latest.stamp)
    .slice(0, limit);
}

