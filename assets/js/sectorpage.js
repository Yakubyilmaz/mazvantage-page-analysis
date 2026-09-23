/* ==========================================================================
   Maz Vantage — the sector pages

   Two levels, the way a sector section wants to work:

     ?view=sectors                  the breakdown across all eleven
     ?view=sectors&sub=technology   one sector, and the companies in it

   The index ranks the sectors on what this report actually knows about them.
   Session performance and an aggregate multiple come from the vendor and are
   the same figures anyone has; the **median composite score** is ours, read
   off the distribution each sector's grades are computed against. It answers
   "which sector grades well", which is a question only this app's own data
   can answer.

   The detail page leads with the fifty largest companies in the sector,
   because that is what a reader has come for, and offers to grade them on the
   same lite path the screens use.

   ---------------------------------------------------------------------------
   Why the grades are behind a button
   ---------------------------------------------------------------------------

   The table itself is one screener call. Grading it is two more per company —
   a hundred requests for fifty rows — so it does not happen until somebody
   asks. Same rule as the screens: the expensive thing waits for consent, and
   the page says what it will cost.
   ========================================================================== */

import { el, isNum, pct, dec, money, fmtDate, signClass, ago } from './util.js';
import { notice, logo } from './ui.js';
import { multiLineChart } from './charts.js';
import { fetchMarket, fetchScreener, fetchFor, fetchEtfInfo, fetchHubFeed, mapLimited, hasApiKey, logoUrl } from './fmp.js';
import { loadSectorStats, sectorLookup, letterFor, MAX_SCORE } from './grading.js';
import {
  scoreLite, normalisePrices, computeReturns, ytdReturn, RETURN_SPANS,
} from './model.js';
import { FACTOR_KEYS, FACTOR_BY_KEY } from './factors.js';
import { gradePill } from './gradeview.js';
import { LISTED, dedupe } from './ideas.js';
import { SECTORS, SECTOR_ETF, MARKET_ETF, sectorFromSlug, sectorSlug } from './nav.js';
import { sectorsBlock } from './sectorsblock.js';
import { emptyState, arrow } from './markethub-ui.js';
import { quoteMap, isUSListing, COUNTRIES } from './markethub-data.js';

/** How many companies the detail page lists. */
const TOP_N = 50;

/**
 * Three destinations, all on the market canvas and all owning their own
 * screen — no page head, no section strip, the way Market Data's boards do.
 *
 *   ?view=sectors                             the breakdown across all eleven
 *   ?view=sectors&sub=technology              one sector
 *   ?view=sectors&sub=industry&industry=…     one industry
 *
 * An industry has no fixed list to slug against — the vendor publishes about
 * 130 of them and renames them — so its name travels in the query rather than
 * in the path. `sub=industry` is a hidden nav entry for exactly this reason,
 * the way the Research feed carries a single article.
 */
export function renderSectorsPage(sub, nav = {}) {
  if (sub === 'industry') {
    const name = industryFromQuery();
    if (name) return groupPage('industry', name, nav);
    return breakdownPage(nav);
  }
  const sector = sectorFromSlug(sub);
  if (!sector) return breakdownPage(nav);
  return groupPage('sector', sector, nav);
}

/** The industry the link carried, as the vendor spells it. */
function industryFromQuery() {
  try { return new URLSearchParams(location.search).get('industry') || null; } catch { return null; }
}

/** Average one sector's rows across whatever exchanges the feed returned. */
function averageFor(res, sector, field) {
  if (res.status !== 'ok') return null;
  const rows = (res.data || []).filter((r) => (r.sector || r.industry) === sector && isNum(r[field]));
  if (!rows.length) return null;
  return rows.reduce((t, r) => t + r[field], 0) / rows.length;
}

/**
 * The middle of a binned distribution.
 *
 * The stats file stores the composite spread as counts per bin rather than as
 * quantiles, so the median is interpolated inside whichever bin the halfway
 * company falls in. Close enough to rank eleven sectors by, and the card says
 * it is read off a histogram rather than computed from the companies.
 */
function medianOfBins(overall) {
  const bins = overall?.bins;
  if (!Array.isArray(bins) || !bins.length) return null;
  const total = bins.reduce((a, b) => a + b, 0);
  if (!total) return null;

  const width = (overall.max ?? MAX_SCORE) / bins.length;
  let seen = 0;
  for (let i = 0; i < bins.length; i += 1) {
    if (seen + bins[i] >= total / 2) {
      const into = bins[i] ? (total / 2 - seen) / bins[i] : 0;
      return (i + into) * width;
    }
    seen += bins[i];
  }
  return null;
}

/* ==========================================================================
   1. The index — the detailed breakdown across all eleven
   ========================================================================== */

/** The median of one metric from a sector's distribution ladder. */
function medianMetric(tbl, id) {
  const p = tbl?.metrics?.[id]?.p;
  return Array.isArray(p) && p.length === 21 ? p[10] : null;
}

/* ==========================================================================
   1. The breakdown — every sector on one canvas

   What changed, and why the two blocks that went are no loss: the session bars
   and the heat grid both drew the vendor's equal-weight average change, which
   is the sector block's own Day column and the colour of its tiles. Drawing
   one measure three times is not three blocks' worth of page. The block leads
   instead, because it is the only thing here that shows what the market is
   *made of* rather than only how it moved, and the table under it carries the
   measure the bars never had: the tracking ETF's return over five windows,
   which is what "the sector was up 12%" means.
   ========================================================================== */

/** The columns of the performance table, in the order a reader reads them. */
const BREAKDOWN_COLUMNS = [
  { key: 'sector', label: 'Sector', identity: true },
  { key: 'session', label: 'Day', numeric: true, tone: true, render: (r) => percentCell(r.session, { already: true }) },
  // Every window on this row arrives as a percentage, the day's included.
  { key: 'r1m', label: '1M', numeric: true, tone: true, render: (r) => percentCell(r.r1m, { already: true }) },
  { key: 'r6m', label: '6M', numeric: true, tone: true, render: (r) => percentCell(r.r6m, { already: true }) },
  { key: 'ytd', label: 'YTD', numeric: true, tone: true, render: (r) => percentCell(r.ytd, { already: true }) },
  { key: 'r1y', label: '1Y', numeric: true, tone: true, render: (r) => percentCell(r.r1y, { already: true }) },
  { key: 'etf', label: 'ETF', render: (r, nav) => r.etf
    ? el('button', { type: 'button', class: 'mkticker', text: r.etf, title: `Open the ${r.etf} report`,
      onclick: () => nav.goSymbol?.(r.etf) })
    : el('span', { class: 'subtle', text: '—' }) },
  { key: 'aum', label: 'AUM', numeric: true, render: (r) => el('span', { text: isNum(r.aum) ? money(r.aum, { currency: '' }) : 'n/a' }) },
  { key: 'fee', label: 'Fee', numeric: true, render: (r) => el('span', { text: isNum(r.fee) ? pct(r.fee, { already: true, dp: 2 }) : 'n/a' }) },
  { key: 'count', label: 'Stocks', numeric: true, render: (r) => el('span', { text: isNum(r.count) ? dec(r.count, 0) : 'n/a' }) },
  { key: 'netMargin', label: 'Median net margin', numeric: true, render: (r) => el('span', { text: isNum(r.netMargin) ? pct(r.netMargin) : 'n/a' }) },
  { key: 'median', label: 'Median composite', numeric: true, render: (r) => isNum(r.median)
    ? el('span', { class: 'secmed' }, [
      el('i', { class: 'secmed__b', style: { width: `${(r.median / MAX_SCORE) * 100}%` } }),
      el('b', { text: dec(r.median, 2) }),
    ])
    : el('span', { class: 'subtle', text: 'n/a' }) },
];

/* The industry view of the same table.

   Six of the twelve sector columns cannot be filled for an industry and are
   not shown as a row of n/a: **no fund tracks a single industry**, so the five
   return windows and the fund's size and fee have no source, and the grade
   distributions this report holds are per sector, so median composite has none
   either. What an industry does have is its parent, its weight, its members,
   the vendor's session snapshot and the vendor's multiple — and those are the
   columns. The note under the table says which measures did not travel and
   why, rather than leaving a reader to infer it from empty cells. */
const INDUSTRY_COLUMNS = [
  { key: 'industry', label: 'Industry', identity: true },
  { key: 'sector', label: 'Sector', render: (r, nav) => (r.sector
    ? el('button', { type: 'button', class: 'mkticker', text: r.sector,
      title: `Open the ${r.sector} sector page`, onclick: () => nav.goView?.('sectors', sectorSlug(r.sector)) })
    : el('span', { class: 'subtle', text: 'n/a' })) },
  { key: 'session', label: 'Day', numeric: true, tone: true, render: (r) => percentCell(r.session, { already: true }) },
  { key: 'pe', label: 'Aggregate P/E', numeric: true, render: (r) => el('span', { text: isNum(r.pe) ? dec(r.pe, 1) : 'n/a' }) },
  { key: 'weight', label: 'Market weight', numeric: true, render: (r) => el('span', { text: isNum(r.weight) ? pct(r.weight, { already: true, dp: 2 }) : 'n/a' }) },
  { key: 'cap', label: 'Market cap', numeric: true, render: (r) => el('span', { text: r.cap > 0 ? money(r.cap) : 'n/a' }) },
  { key: 'count', label: 'Companies', numeric: true, render: (r) => el('span', { text: isNum(r.count) ? dec(r.count, 0) : 'n/a' }) },
];

/* The country grain.

   A country *is* a fund here, which neither of the other two grains is: every
   market in the picker has a US-listed tracker, so this table can carry real
   return windows where the industry grain cannot. Both halves come from feeds
   that take a symbol list — one `batch-quote` for the price and the session,
   one `stock-price-change` for the windows — so the whole table is two
   requests for forty-odd countries.

   The three countries with no fund are still rows: Czechia and Iceland were
   never wrapped in one and Russia's has not traded since 2022. A table of
   country funds that quietly omitted the countries without one would be
   answering a different question. */
const COUNTRY_COLUMNS = [
  { key: 'country', label: 'Country', identity: true },
  { key: 'fund', label: 'ETF', render: (r, nav) => (r.fund
    ? el('button', { type: 'button', class: 'mkticker', text: r.fund, title: r.fundName,
      onclick: () => nav.goSymbol?.(r.fund) })
    : el('span', { class: 'subtle', text: 'none' })) },
  { key: 'price', label: 'Price', numeric: true, render: (r) => el('span', { text: isNum(r.price) ? dec(r.price, 2) : 'n/a' }) },
  { key: 'change', label: 'Day', numeric: true, render: (r) => percentCell(r.change, { already: true }) },
  { key: 'm1', label: '1M', numeric: true, render: (r) => percentCell(r.m1, { already: true }) },
  { key: 'm6', label: '6M', numeric: true, render: (r) => percentCell(r.m6, { already: true }) },
  { key: 'ytd', label: 'YTD', numeric: true, render: (r) => percentCell(r.ytd, { already: true }) },
  { key: 'y1', label: '1Y', numeric: true, render: (r) => percentCell(r.y1, { already: true }) },
  { key: 'region', label: 'Region' },
];

/** Two requests: the quote for today, the price-change feed for the windows. */
async function countryRows() {
  const places = COUNTRIES.filter((c) => c.name);
  const symbols = places.map((c) => c.fund?.symbol).filter(Boolean);
  if (!symbols.length || !hasApiKey()) {
    return places.map((c) => ({ country: c.name, code: c.code, region: c.group,
      fund: c.fund?.symbol || null, fundName: c.fund?.name || '' }));
  }
  const [quotes, changes] = await Promise.all([
    quoteMap(symbols),
    fetchHubFeed('priceChanges', { symbol: symbols.join(',') }),
  ]);
  const windows = new Map((Array.isArray(changes.data) ? changes.data : [])
    .filter((r) => r && r.symbol).map((r) => [String(r.symbol).toUpperCase(), r]));
  const number = (row, key) => (row && isNum(row[key]) ? Number(row[key]) : null);

  return places.map((c) => {
    const symbol = c.fund?.symbol || null;
    const quote = symbol ? quotes.get(symbol.toUpperCase()) : null;
    const window = symbol ? windows.get(symbol.toUpperCase()) : null;
    return {
      country: c.name, code: c.code, region: c.group,
      fund: symbol, fundName: c.fund?.name || '',
      price: quote?.price ?? null,
      change: quote?.changesPercentage ?? number(window, '1D'),
      m1: number(window, '1M'), m6: number(window, '6M'),
      ytd: number(window, 'ytd'), y1: number(window, '1Y'),
    };
  });
}

/** A signed, coloured percentage, or a quiet dash where the feed had none. */
function percentCell(value, options = {}) {
  if (!isNum(value)) return el('span', { class: 'subtle', text: 'n/a' });
  return el('span', { class: signClass(value), text: pct(value, { sign: true, ...options }) });
}

/**
 * The page. Built whole and empty, then filled — the canvas pattern, so the
 * sector block above can load on its own clock rather than behind this page's
 * slowest request.
 */
function breakdownPage(nav) {
  const page = el('main', { class: 'mh-page mi-page mi-page--sectors', id: 'sectors-breakdown' });
  const stamp = el('span', {});
  const body = el('div', { class: 'mi-body' });
  const table = el('div', { class: 'mh-section__body' }, [emptyState('loading', '', true)]);
  const coverage = el('div', {});
  /* Sectors or the industries inside them: the same measure at two grains, so
     it is one control over one table rather than two sections that repeat each
     other. Eleven rows or a hundred and thirty, and the columns change with
     the grain because the data does. */
  let grain = null;
  let level = 'sectors';
  let loaded = null;
  // The country grain is two requests of its own, so it is fetched the first
  // time it is asked for rather than with the page.
  let countries = null;
  let fetchingCountries = false;
  const navigation = el('nav', { class: 'mh-navigation', 'aria-label': 'Sector sections' });

  const NOTES = {
    sectors: () => 'Eleven sectors, each measured twice: the Day column is the vendor\u2019s session snapshot, which counts every member equally, and the return windows are the tracking ETF\u2019s, which weight members by size. On a day the megacaps move against the tail the two disagree, and that disagreement is the point rather than an error.',
    industries: () => `${loaded.industries.length} industries, and six of the columns above are gone rather than empty: no fund tracks a single industry, so the return windows, fund size and fee have no source, and this report\u2019s grade distributions are held per sector. Market weight is each industry\u2019s share of the whole listed market, computed from its members.`,
    countries: () => `Every market the Market Data picker offers, through the US-listed fund that tracks it — which is what makes the return windows real here and absent from the industries beside them. Prices are the fund\u2019s, in dollars, so an unhedged fund carries the currency as well as the market. Click a country for its market page, or its fund for the fund\u2019s own report.`,
  };

  const drawTable = () => {
    if (!loaded) return;
    const note = el('p', { class: 'mh-section-description', text: NOTES[level]() });
    if (level === 'countries') {
      if (!countries) {
        table.replaceChildren(note, emptyState('loading', '', true));
        if (!fetchingCountries) {
          fetchingCountries = true;
          countryRows().then((rows) => { countries = rows; drawTable(); })
            .catch((error) => table.replaceChildren(note, emptyState('error', String(error?.message || error))));
        }
        return;
      }
      table.replaceChildren(note, groupTable(COUNTRY_COLUMNS, countries, nav, { key: 'ytd', dir: -1 }));
      return;
    }
    table.replaceChildren(note, level === 'sectors'
      ? sectorTable(loaded.rows, nav)
      : groupTable(INDUSTRY_COLUMNS, loaded.industries, nav, { key: 'weight', dir: -1 }));
  };

  grain = el('div', { class: 'mh-ideas__rail gp-grain', role: 'group', 'aria-label': 'Sectors, industries or countries' },
    [['sectors', 'Sectors'], ['industries', 'Industries'], ['countries', 'Countries']].map(([id, label]) => el('button', {
      type: 'button', class: `mh-idea${id === level ? ' is-active' : ''}`, 'aria-pressed': String(id === level),
      text: label,
      onclick: (event) => {
        level = id;
        for (const button of grain.children) {
          const on = button === event.currentTarget;
          button.classList.toggle('is-active', on);
          button.setAttribute('aria-pressed', String(on));
        }
        drawTable();
      },
    })));

  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  navigation.append(
    el('button', { type: 'button', class: 'is-active', text: 'Breakdown', onclick: () => jump('market-sectors') }),
    el('button', { type: 'button', text: 'Performance', onclick: () => jump('sector-performance') }),
  );

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'SECTORS' }),
      el('h1', { class: 'mi-title', text: 'Sectors' }),
      el('div', { class: 'mh-hero__meta' }, [
        el('span', { text: 'What the market is made of, and how each part of it has done' }),
        el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
        stamp,
        el('button', {
          type: 'button', class: `mh-connection ${hasApiKey() ? 'is-connected' : ''}`,
          text: hasApiKey() ? 'FMP connected' : 'Connect FMP', onclick: () => nav.openSettings?.(),
        }),
      ]),
    ]),
    navigation,
    body,
  );

  // The block Market Data leads with, leading here too — and here it is the
  // subject of the page, so its heading says what it shows rather than
  // repeating the page's own title.
  body.append(
    sectorsBlock({
      // The list's third column is the year now, and the heading follows it;
      // the map head says the tiles are still coloured by the session.
      title: 'Market weight and the year',
      onSectorPage: (sector) => nav.goView?.('sectors', sectorSlug(sector)),
    }),
    el('section', { class: 'mh-section', id: 'sector-performance', 'aria-label': 'Sector performance' }, [
      el('h2', { class: 'mh-heading mh-heading--section' }, [
        el('span', { class: 'mh-section-mark mh-section-mark--stocks', 'aria-hidden': 'true', text: '↗' }),
        'Performance',
      ]),
      grain,
      table,
      coverage,
    ]),
  );

  breakdownRows().then(({ rows, industries, perf, seeded, live }) => {
    if (!page.isConnected && !table.isConnected) return;
    if (perf.date) stamp.textContent = fmtDate(perf.date);
    loaded = { rows, industries };
    drawTable();
    const notes = [
      live
        ? 'Returns are the tracking ETF\u2019s total price return to its last close, so they include the fund\u2019s fee and exclude its distributions.'
        : 'The ETF columns need a live FMP connection \u2014 add your API key in Settings.',
      'Stocks, median net margin and median composite are read off this report\u2019s own sector distribution: the companies it can rank, the middle of their net margins, and the middle of their composite scores.',
      seeded
        ? 'The sector distribution table shipped with this repo is modelled rather than measured, so those last three columns inherit that. The ETF columns do not \u2014 those are live market data. Run tools/build_sector_stats.py against a live key to replace the table.'
        : null,
    ].filter(Boolean);
    coverage.replaceChildren(el('details', { class: 'mh-coverage' }, [
      el('summary', { text: 'Data coverage' }),
      el('div', {}, notes.map((note) => el('p', { text: note }))),
    ]));
  }).catch((error) => {
    table.replaceChildren(emptyState('error', String(error?.message || error)));
  });

  page.append(el('footer', { class: 'mh-footer' }, [
    el('span', { text: 'Sector data by Financial Modeling Prep. Distribution columns are this report\u2019s own.' }),
    el('button', { type: 'button', text: 'Back to top \u2191', onclick: () => page.scrollIntoView({ behavior: 'smooth' }) }),
  ]));
  return page;
}

/** Everything the table needs: the vendor's snapshot, and this app's own. */
async function breakdownRows() {
  const [perf, pe, stats] = await Promise.all([
    fetchMarket('sectorPerf'),
    fetchMarket('sectorPe'),
    loadSectorStats(),
  ]);

  /* The five return windows come from `stock-price-change`, which takes a
     symbol list — one request for all eleven funds, and the **same** source
     the sector block above reads its YTD from. Computing them here from closes
     instead cost eleven requests and put two slightly different YTDs on one
     page, which is a worse answer to the same question.

     The fund's size and fee still cost a request each, because `etf/info`
     takes one symbol. They are only worth spending when there is a key to
     spend them with; the rest of the page works without one. */
  /* Built exactly as the sector block builds it — same symbols, same order,
     so the two land on one cached request rather than two nearly identical
     ones. The market's own fund rides along unused here; the block prints it
     on its "All sectors" row. */
  const funds = [...new Set([...Object.values(SECTOR_ETF), MARKET_ETF])];
  const [changes, infos] = hasApiKey()
    ? await Promise.all([
      fetchHubFeed('priceChanges', { symbol: funds.join(',') }),
      mapLimited(SECTORS, async (s) => {
        const etf = SECTOR_ETF[s];
        const info = etf ? await fetchEtfInfo(etf) : null;
        return info?.status === 'ok' ? info.data : null;
      }, 4),
    ])
    : [{ status: 'skipped', data: [] }, SECTORS.map(() => null)];
  const changeBy = new Map((Array.isArray(changes.data) ? changes.data : [])
    .filter((r) => r && r.symbol).map((r) => [String(r.symbol).toUpperCase(), r]));
  const etfs = SECTORS.map((s, i) => {
    const etf = SECTOR_ETF[s] || null;
    const row = etf ? changeBy.get(etf.toUpperCase()) : null;
    const window = (key) => (row && isNum(row[key]) ? Number(row[key]) : null);
    return { etf, info: infos[i],
      r1d: window('1D'), r1m: window('1M'), r6m: window('6M'), ytd: window('ytd'), r1y: window('1Y') };
  });

  const rows = SECTORS.map((s, i) => {
    const tbl = stats?.sectors?.[s];
    return {
      sector: s,
      session: averageFor(perf, s, 'averageChange'),
      pe: averageFor(pe, s, 'pe'),
      count: tbl?.count ?? null,
      netMargin: medianMetric(tbl, 'netMargin'),
      median: medianOfBins(tbl?.overall),
      ...etfs[i],
      aum: etfs[i]?.info?.assetsUnderManagement ?? null,
      fee: etfs[i]?.info?.expenseRatio ?? null,
    };
  });
  return { rows, industries: await industryRows(), perf,
    seeded: stats?.source === 'seed', live: rows.some((r) => isNum(r.r1y)) };
}

/**
 * Every industry the market holds, with its parent and its weight.
 *
 * The weights and the parent come from the screener — one request, and the
 * same one the sector block above already made, so `fmp.js` serves it from
 * cache. The session and the multiple are the vendor's two industry snapshots.
 */
async function industryRows() {
  const [screen, perf, pe] = await Promise.all([
    hasApiKey() ? fetchScreener({ country: 'US', isEtf: false, isFund: false, isActivelyTrading: true,
      includeAllShareClasses: false, marketCapMoreThan: 1e8, limit: 5000 }) : Promise.resolve({ status: 'skipped' }),
    fetchMarket('industryPerf'),
    fetchMarket('industryPe'),
  ]);

  /* Deduplicated for the same reason the sector block deduplicates: the
     screener returns every listing of a US-domiciled company, priced in the
     currency it trades in, so the raw rows carry pesos and count a company
     once per venue. */
  const by = new Map();
  let total = 0;
  for (const row of dedupe((screen.status === 'ok' ? screen.data : []).filter(isUSListing))) {
    const name = row.industry;
    const cap = Number(row.marketCap);
    if (!name || !Number.isFinite(cap) || cap <= 0) continue;
    total += cap;
    const cur = by.get(name) || { industry: name, cap: 0, count: 0, sectors: new Map() };
    cur.cap += cap;
    cur.count += 1;
    if (row.sector) cur.sectors.set(row.sector, (cur.sectors.get(row.sector) || 0) + cap);
    by.set(name, cur);
  }

  return [...by.values()].map((r) => ({
    industry: r.industry,
    // The parent is whichever sector holds most of the industry's market
    // value: the vendor publishes the pairing on each listing, not as a table.
    sector: [...r.sectors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    cap: r.cap,
    count: r.count,
    weight: total > 0 ? (r.cap / total) * 100 : null,
    session: averageFor(perf, r.industry, 'averageChange'),
    pe: averageFor(pe, r.industry, 'pe'),
  })).sort((a, b) => b.cap - a.cap);
}

/** The sector grain of the table. */
function sectorTable(rows, nav) {
  return groupTable(BREAKDOWN_COLUMNS, rows, nav, { key: 'session', dir: -1 });
}

/** The dense table: every column sorts, the first column stays put. */
function groupTable(columns, rows, nav, initial) {
  const host = el('div', { class: 'mi-table__scroll' });
  let sort = { ...initial };

  const draw = () => {
    const ordered = [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (!isNum(av) && typeof av !== 'string') return !isNum(bv) && typeof bv !== 'string' ? 0 : 1;
      if (!isNum(bv) && typeof bv !== 'string') return -1;
      return (typeof av === 'string' ? av.localeCompare(String(bv)) : av - bv) * sort.dir;
    });
    const head = el('tr', {}, columns.map((column) => {
      const active = sort.key === column.key;
      return el('th', {
        class: `${column.numeric ? 'mi-table__n' : ''}${active ? ' is-sorted' : ''}`.trim(),
        scope: 'col', 'aria-sort': active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none',
      }, [
        el('button', {
          type: 'button',
          onclick: () => {
            sort = active ? { key: column.key, dir: sort.dir * -1 }
              : { key: column.key, dir: column.identity ? 1 : -1 };
            draw();
          },
        }, [column.label, active ? el('span', { class: 'mi-sort', 'aria-hidden': 'true', text: sort.dir === 1 ? '\u2191' : '\u2193' }) : null].filter(Boolean)),
      ]);
    }));
    host.replaceChildren(el('table', { class: 'mi-table' }, [
      el('thead', {}, [head]),
      el('tbody', {}, ordered.map((row) => el('tr', {}, columns.map((column) => (column.identity
        ? el('td', { class: 'mi-table__id' }, [el('button', {
          type: 'button', class: 'mkticker', text: row[column.key],
          title: `Open the ${row[column.key]} page`,
          onclick: () => {
            if (column.key === 'industry') return nav.goIndustry?.(row.industry);
            // A country's own page is its market page, where the picker, the
            // indices and the listings for it already live.
            if (column.key === 'country') return nav.goView?.('markets', 'overview', { country: row.code });
            return nav.goView?.('sectors', sectorSlug(row.sector));
          },
        })])
        : el('td', { class: column.numeric ? 'mi-table__n' : '' }, [column.render
          ? column.render(row, nav)
          : el('span', { text: row[column.key] == null ? 'n/a' : String(row[column.key]) })])))))),
    ]));
  };

  draw();
  return host;
}

/** A return cell: signed, coloured, tabular. */
function ret(v) {
  return el('td', { class: 'num' }, [isNum(v)
    ? el('span', { class: signClass(v), text: pct(v, { sign: true }) })
    : el('span', { class: 'subtle', text: 'n/a' })]);
}

/* ==========================================================================
   2. The detail — one sector, and everything in it

   The shape a sector page wants: what the sector is, how it has done against
   the market, what it is made of, and who the big names are.

   One screener call feeds three of those. It returns every listed US company
   in the sector with a market capitalisation, an industry and a day change,
   which is enough to compute the industry mix, the market weights and the
   top fifty without asking again.
   ========================================================================== */

/**
 * What each sector is, in a sentence.
 *
 * Definitional rather than analytical — what kinds of company sit in the
 * bucket, not whether the bucket is a good investment. Written out because
 * the vendor supplies no sector description and a page that opens with a bare
 * table tells a reader nothing about what they are looking at.
 */
const SECTOR_BLURB = {
  Technology: 'Companies that build, sell or run technology: semiconductors and the equipment '
    + 'that makes them, software and cloud services, hardware, and IT services. It is the largest '
    + 'sector by market value in the US market and the most concentrated in a handful of names.',
  Healthcare: 'Drug makers and biotechnology, medical devices and diagnostics, hospitals and '
    + 'insurers, and the distributors between them. Demand tracks demographics rather than the '
    + 'business cycle, but the sector carries patent, trial and reimbursement risk that little '
    + 'else does.',
  'Financial Services': 'Banks, insurers, asset managers, exchanges and payment networks. The '
    + 'only sector where leverage is the product rather than a risk to it, which is why most of '
    + 'the ratios used elsewhere in this report read differently here.',
  'Consumer Cyclical': 'What people buy when they feel comfortable: cars, homebuilders, '
    + 'restaurants, hotels, apparel and most e-commerce. Earnings swing with employment and '
    + 'credit, which is what makes the sector cyclical.',
  'Communication Services': 'Telecoms and media, and the internet platforms that sell '
    + 'advertising. A sector assembled fairly recently out of two very different halves — '
    + 'regulated network operators and high-margin advertising businesses.',
  Industrials: 'Aerospace and defence, machinery, transport and logistics, construction and '
    + 'business services. The sector most directly geared to capital spending and freight '
    + 'volumes.',
  'Consumer Defensive': 'Food, drink, household products, tobacco and the shops that sell them. '
    + 'Demand is close to inelastic, so revenue is steady and margins are thin.',
  Energy: 'Oil and gas producers, refiners, drillers and the pipelines between them. Earnings '
    + 'are a function of a commodity price the companies do not set, which dominates everything '
    + 'else about the sector.',
  'Basic Materials': 'Miners, chemicals, steel, paper and packaging. Like energy, a price-taking '
    + 'sector, but with longer capital cycles and more exposure to construction.',
  'Real Estate': 'Property owners and managers, mostly structured as REITs, which pay out the '
    + 'bulk of their income and are read on funds from operations rather than on earnings. Highly '
    + 'sensitive to interest rates.',
  Utilities: 'Regulated electricity, gas and water. Returns are set by regulators rather than by '
    + 'competition, which makes the sector bond-like: steady, income-heavy and rate-sensitive.',
};

/** Price points a comparison chart draws before it turns to mush. */
const CHART_POINTS = 64;

/** The windows the comparison offers. */
const WINDOWS = [
  { key: '1M', label: '1M', days: 30 },
  { key: '6M', label: '6M', days: 183 },
  { key: 'YTD', label: 'YTD', days: null },
  { key: '1Y', label: '1Y', days: 365 },
  { key: '5Y', label: '5Y', days: 1825 },
];

/* ==========================================================================
   2. One group — a sector, or an industry inside one

   The destination behind every sector and industry name on this canvas, and
   the two reference pages merged into one: the composition and largest members
   a market site leads with, and the grade distribution and quant columns this
   report has and they do not.

   Sector and industry are the same page with two differences, and both are
   differences in the data rather than in the design:

     - **A sector has a fund and an industry does not.** So the sector gets a
       real comparison against the S&P 500 drawn from its tracking ETF, and the
       industry says plainly that no fund tracks it and shows what can be
       measured from its members instead.
     - **Grades are distributed per sector.** An industry's companies are
       graded against their parent sector's distribution, so the industry page
       says whose distribution it is and links to it rather than drawing a
       histogram that is not its own.
   ========================================================================== */

/** A slug both ways, for industries, which have no fixed list to look up. */
export const industrySlug = (name) => String(name || '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The page. Built whole and empty, then filled section by section, so the
 * frame and the strip are on screen while the screener call is still out.
 */
function groupPage(kind, name, nav) {
  const isSector = kind === 'sector';
  // The router names the tab from the nav entry, and an industry's entry is
  // the hidden one called "Industry" — true of the route, useless to a reader
  // with three of these open. The page knows which one it is, so it says so.
  try { document.title = `${name} — Maz Vantage`; } catch { /* no document */ }
  const page = el('main', { class: 'mh-page mi-page mi-page--group', id: 'sector-group' });
  const body = el('div', { class: 'mi-body' });
  const navigation = el('nav', { class: 'mh-navigation', 'aria-label': `${name} sections` });
  const crumbs = el('div', { class: 'mh-eyebrow' }, [
    el('button', { type: 'button', class: 'mi-crumb', onclick: () => nav.goView?.('sectors', 'all') }, ['Sectors', arrow()]),
  ]);
  const chips = el('div', { class: 'mh-hero__meta' }, [emptyState('loading', '', true)]);

  page.append(
    el('header', { class: 'mh-hero' }, [
      crumbs,
      el('h1', { class: 'mi-title', text: name }),
      chips,
    ]),
    navigation,
    body,
  );

  const section = (id, title, mark = '◳') => {
    const content = el('div', { class: 'mh-section__body' }, [emptyState('loading', '', true)]);
    const node = el('section', { class: 'mh-section', id, 'aria-label': title }, [
      el('h2', { class: 'mh-heading mh-heading--section' }, [
        el('span', { class: `mh-section-mark mh-section-mark--sectors`, 'aria-hidden': 'true', text: mark }),
        title,
      ]),
      content,
    ]);
    body.append(node);
    return content;
  };

  const panels = {
    summary: section('group-summary', 'Summary', '◳'),
    performance: section('group-performance', 'Performance', '↗'),
    ...(isSector ? { industries: section('group-industries', 'Industries', '▦') } : {}),
    companies: section('group-companies', `Largest ${name} companies`, '▤'),
    news: section('group-news', 'News', '◈'),
    grades: section('group-grades', isSector ? 'Grade distribution' : 'How this industry is graded', '◷'),
    siblings: section('group-siblings', isSector ? 'Every other sector' : 'Its neighbours', '◉'),
  };

  navigation.append(...Object.entries({
    summary: 'Summary', performance: 'Performance',
    ...(isSector ? { industries: 'Industries' } : {}),
    companies: 'Companies', news: 'News', grades: 'Grades',
  }).map(([id, label], i) => el('button', {
    type: 'button', class: i === 0 ? 'is-active' : '', text: label,
    onclick: () => document.getElementById(`group-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  })));

  page.append(el('footer', { class: 'mh-footer' }, [
    el('span', { text: 'Company and market data by Financial Modeling Prep. Grades and distributions are this report\u2019s own.' }),
    el('button', { type: 'button', text: 'Back to top \u2191', onclick: () => page.scrollIntoView({ behavior: 'smooth' }) }),
  ]));

  fillGroup({ kind, name, isSector, nav, panels, chips, crumbs }).catch((error) => {
    for (const host of Object.values(panels)) {
      if (host.querySelector('.mh-empty')) host.replaceChildren(emptyState('error', String(error?.message || error)));
    }
  });
  return page;
}

/** Everything the page shows, in the order the requests can be made. */
async function fillGroup({ kind, name, isSector, nav, panels, chips, crumbs }) {
  const etf = isSector ? SECTOR_ETF[name] : null;
  const from = new Date(Date.now() - 6 * 365 * 864e5).toISOString().slice(0, 10);
  const query = isSector ? { sector: name } : { industry: name };

  const [perf, indPerf, pe, stats, screener, etfPrices, etfInfo, spyPrices] = await Promise.all([
    fetchMarket('sectorPerf'),
    fetchMarket('industryPerf'),
    fetchMarket(isSector ? 'sectorPe' : 'industryPe'),
    loadSectorStats(),
    hasApiKey() ? fetchScreener({ ...LISTED, ...query, limit: 5000 }) : Promise.resolve({ status: 'skipped' }),
    etf && hasApiKey() ? fetchFor('prices', etf, { from }) : Promise.resolve({ status: 'skipped' }),
    etf && hasApiKey() ? fetchEtfInfo(etf) : Promise.resolve({ status: 'skipped' }),
    isSector && hasApiKey() ? fetchFor('prices', MARKET_ETF, { from }) : Promise.resolve({ status: 'skipped' }),
  ]);

  const universe = buildUniverse(screener);
  /* The screener carries no day change — it returns a company's size, price
     and classification and nothing about the session — so the Day column here
     read n/a for every row. `batch-quote` takes fifty symbols in one request,
     which is exactly the fifty this page prints, so one call fills the column
     and refreshes the price beside it. */
  const quotes = await quoteMap(universe.ok ? universe.rows.slice(0, TOP_N).map((r) => r.symbol) : []);
  for (const row of (universe.ok ? universe.rows : [])) {
    const quote = quotes.get(String(row.symbol).toUpperCase());
    if (!quote) continue;
    row.quoted = true;
    if (isNum(quote.price)) row.price = quote.price;
    if (isNum(quote.changesPercentage)) row.change = quote.changesPercentage;
  }
  // An industry's parent is not published as a field of its own, so it is read
  // off its members: the sector the weight of the industry actually sits in.
  const parent = isSector ? name : parentSectorOf(universe);
  if (!isSector && parent) {
    crumbs.append(el('button', {
      type: 'button', class: 'mi-crumb',
      onclick: () => nav.goView?.('sectors', sectorSlug(parent)),
    }, [parent, arrow()]));
  }

  const session = isSector
    ? averageFor(perf, name, 'averageChange')
    : averageFor(indPerf, name, 'averageChange');
  const multiple = averageFor(pe, name, 'pe');
  const capWeighted = capWeightedDay(universe);
  const info = etfInfo.status === 'ok' ? etfInfo.data : null;
  const pts = etfPrices.status === 'ok' ? normalisePrices(etfPrices.data) : [];
  const ytd = pts.length > 1 ? ytdReturn(pts) : null;

  /* ---- the hero's own line ------------------------------------------------ */
  chips.replaceChildren(...[
    el('span', { text: universe.ok
      ? `${dec(universe.companyCount, 0)} companies · ${money(universe.total)}`
      : 'Connect FMP to load this group' }),
    el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
    el('span', { text: isSector ? 'Sector' : `Industry${parent ? ` in ${parent}` : ''}` }),
    etf ? el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }) : null,
    etf ? el('button', { type: 'button', class: 'mh-connection is-connected', text: `${etf} \u2192`,
      onclick: () => nav.goSymbol?.(etf) }) : null,
  ].filter(Boolean));

  /* ---- summary ------------------------------------------------------------ */
  const blurb = isSector ? SECTOR_BLURB[name] : null;
  panels.summary.replaceChildren(...[
    blurb ? el('p', { class: 'mh-section-description', text: blurb }) : null,
    statGrid([
    ['Companies', universe.ok ? dec(universe.companyCount, 0) : 'n/a', universe.ok
      ? `${dec(universe.listingCount, 0)} listings, cross-listings collapsed` : 'needs a live key'],
    ['Market capitalisation', universe.ok && universe.total > 0 ? money(universe.total) : 'n/a',
      'summed from the members themselves'],
    ['Day, members counted equally', signed(session), 'the vendor\u2019s snapshot'],
    ['Day, largest 50 by size', signed(capWeighted), 'the fifty quoted below, weighted'],
    ['Aggregate P/E', isNum(multiple) ? dec(multiple, 1) : 'n/a', 'the vendor\u2019s snapshot'],
    isSector
      ? ['Year to date', signed(isNum(ytd) ? ytd * 100 : null), etf ? `${etf}, the tracking fund` : 'no fund']
      : ['Tracking fund', 'none', 'no ETF tracks a single industry'],
    ['Median composite', medianOfBins(stats?.sectors?.[parent]?.overall) != null
      ? `${dec(medianOfBins(stats.sectors[parent].overall), 2)} of ${MAX_SCORE}` : 'n/a',
    isSector ? 'the middle of this sector\u2019s scores' : `from ${parent || 'the parent sector'}`],
    isSector && info ? ['Fund assets', isNum(info.assetsUnderManagement) ? money(info.assetsUnderManagement) : 'n/a',
      isNum(info.expenseRatio) ? `${pct(info.expenseRatio, { already: true, dp: 2 })} expense ratio` : ''] : null,
  ].filter(Boolean)),
  ].filter(Boolean));

  /* ---- performance -------------------------------------------------------- */
  panels.performance.replaceChildren(isSector
    ? versusBlock(name, etf, etfPrices, spyPrices)
    : industryPerformance(name, parent, universe, nav));

  /* ---- what it is made of ------------------------------------------------- */
  if (panels.industries) {
    panels.industries.replaceChildren(universe.ok
      ? industryTable(name, universe, indPerf, nav)
      : emptyState(screener.status, screener.message || 'The industry breakdown needs a live FMP key.', true));
  }

  /* ---- the members -------------------------------------------------------- */
  panels.companies.replaceChildren(universe.ok
    ? companyTable(universe, stats, parent, nav)
    : emptyState(screener.status, screener.message || 'This company table needs a live FMP key.', true));

  /* ---- the wire ----------------------------------------------------------- */
  const news = await groupNews(universe);
  panels.news.replaceChildren(newsBlock(name, news, nav));

  /* ---- the distribution behind every grade -------------------------------- */
  panels.grades.replaceChildren(isSector
    ? distributionBlock(name, stats)
    : el('div', {}, [
      el('p', { class: 'mh-section-description', text: `Grades are distributed per sector, not per industry: every company here is ranked against ${parent || 'its parent sector'}\u2019s distribution rather than against its industry peers. A page that drew an industry histogram would be inventing a distribution this report does not hold.` }),
      parent ? el('button', { type: 'button', class: 'mh-see-all', onclick: () => nav.goView?.('sectors', sectorSlug(parent)) },
        [`See the ${parent} distribution`, arrow()]) : null,
    ].filter(Boolean)));

  /* ---- where else to go --------------------------------------------------- */
  panels.siblings.replaceChildren(isSector
    ? siblingSectors(name, perf, nav)
    : siblingIndustries(name, parent, indPerf, nav));
}

/** The sector most of an industry's market value sits in. */
function parentSectorOf(universe) {
  if (!universe.ok) return null;
  const by = new Map();
  for (const row of universe.rows) {
    if (!row.sector) continue;
    by.set(row.sector, (by.get(row.sector) || 0) + (row.marketCap || 0));
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/** The day's move with members counted by size rather than one each. */
function capWeightedDay(universe) {
  if (!universe.ok) return null;
  let cap = 0, moved = 0;
  // Over the quoted rows only: weighting the whole group would need a quote
  // for every member, so the figure is labelled as the fifty it comes from.
  for (const row of universe.rows.filter((r) => r.quoted)) {
    if (!isNum(row.change) || !isNum(row.marketCap) || row.marketCap <= 0) continue;
    cap += row.marketCap;
    moved += row.change * row.marketCap;
  }
  return cap > 0 ? moved / cap : null;
}

/** A figure, coloured, in percentage points the feed already gave. */
const signed = (value) => (isNum(value)
  ? el('span', { class: signClass(value), text: pct(value, { already: true, sign: true }) })
  : el('span', { class: 'subtle', text: 'n/a' }));

/** The summary grid: label, figure, and the line that says where it is from. */
function statGrid(items) {
  return el('div', { class: 'gp-stats' }, items.map(([label, value, note]) => el('div', { class: 'gp-stat' }, [
    el('span', { class: 'gp-stat__k', text: label }),
    el('strong', { class: 'gp-stat__v' }, [value instanceof Node ? value : el('span', { text: String(value) })]),
    note ? el('span', { class: 'gp-stat__n', text: note }) : null,
  ].filter(Boolean))));
}

/** The two series on their common dates, from `cut` onwards. */
function align(a, b, cut) {
  const byDate = new Map(b.map((p) => [p.date, p.price]));
  const out = [];
  for (const p of a) {
    if (new Date(p.date).getTime() < cut) continue;
    const other = byDate.get(p.date);
    if (isNum(other) && isNum(p.price)) out.push({ date: p.date, a: p.price, b: other });
  }
  return out;
}

/** Thin a series to about `n` points, always keeping the last one. */
function every(list, n) {
  if (list.length <= n) return list;
  const step = Math.ceil(list.length / n);
  const out = list.filter((_, i) => i % step === 0);
  if (out.at(-1) !== list.at(-1)) out.push(list.at(-1));
  return out;
}

/* ---------- the members, from one screener call ----------------------------

   Every listed company in the group, deduplicated, with the weights derived.
   `dedupe` is the same pass the screens and the calendar use: a company with a
   US line and two European ones would otherwise be counted three times in the
   mix and take three of the top fifty. */
function buildUniverse(res) {
  if (res.status !== 'ok') return { ok: false, status: res.status, message: res.message };

  /* US listings only, and then one row per company.

     `dedupe` collapses by base symbol, which catches `NVDA` against `NVDA.NE`
     and misses `LRCX` against `LAR0.DE` — Lam Research's German line, whose
     ticker shares nothing with its US one. Left in, that company was counted
     twice in the industry's market value and entered the member index twice,
     at a price quoted in another currency. A US listing is the one line whose
     capitalisation and price are both in dollars. */
  const listings = (res.data || []).filter((h) => h.symbol && !h.isEtf && !h.isFund && isUSListing(h));
  const unique = dedupe(listings);

  const rows = unique.map((h) => ({
    symbol: h.symbol,
    name: h.companyName || h.symbol,
    sector: h.sector || null,
    industry: h.industry || 'Unclassified',
    marketCap: isNum(h.marketCap) ? h.marketCap : null,
    price: isNum(h.price) ? h.price : null,
    change: isNum(h.changePercentage) ? h.changePercentage : null,
    lite: null,
  }));

  const total = rows.reduce((t, r) => t + (r.marketCap || 0), 0);
  for (const r of rows) r.weight = total > 0 && isNum(r.marketCap) ? r.marketCap / total : null;

  // Industry mix, by weight rather than by count: twenty small software
  // companies and one giant semiconductor are not an equal split of the
  // sector, and a count would say they were.
  const byIndustry = new Map();
  for (const r of rows) {
    const cur = byIndustry.get(r.industry) || { industry: r.industry, n: 0, cap: 0 };
    cur.n += 1;
    cur.cap += r.marketCap || 0;
    byIndustry.set(r.industry, cur);
  }
  const industries = [...byIndustry.values()]
    .map((x) => ({ ...x, weight: total > 0 ? x.cap / total : null }))
    .sort((a, b) => b.cap - a.cap);

  return {
    ok: true,
    rows: [...rows].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)),
    industries,
    total,
    listingCount: listings.length,
    companyCount: rows.length,
  };
}

/** How many of the group's companies the news call covers. */
const NEWS_COVER = 30;

/** One request: `news/stock` takes a comma-separated `symbols` list. */
async function groupNews(universe) {
  if (!universe.ok || !hasApiKey()) return { status: 'skipped', symbols: [] };
  const symbols = universe.rows.slice(0, NEWS_COVER).map((r) => r.symbol).filter(Boolean);
  if (!symbols.length) return { status: 'empty', symbols: [] };
  const res = await fetchFor('news', symbols.join(','));
  return { ...res, symbols };
}

/* ---------- performance ----------------------------------------------------- */

/** The sector against the market, from the fund that tracks it. */
function versusBlock(sector, etf, etfPrices, spyPrices) {
  if (etfPrices.status !== 'ok' || spyPrices.status !== 'ok') {
    return emptyState(etfPrices.status === 'skipped' ? 'skipped' : etfPrices.status,
      'The comparison is drawn from the sector fund and the S&P 500 fund. Add your FMP API key in Settings.');
  }

  const a = normalisePrices(etfPrices.data);
  const b = normalisePrices(spyPrices.data);
  const host = el('div');
  let active = '1Y';

  const strip = el('div', { class: 'rangesel' }, WINDOWS.map((w) => el('button', {
    type: 'button', class: w.key === active ? 'is-on' : '', text: w.label,
    onclick: (event) => {
      active = w.key;
      [...strip.children].forEach((c) => c.classList.toggle('is-on', c === event.currentTarget));
      draw();
    },
  })));

  function draw() {
    const w = WINDOWS.find((x) => x.key === active);
    const cut = w.days ? Date.now() - w.days * 864e5 : Date.UTC(new Date().getUTCFullYear(), 0, 1);
    const pair = align(a, b, cut);
    if (pair.length < 2) {
      host.replaceChildren(emptyState('unavailable', 'Not enough overlapping price history for this window.', true));
      return;
    }
    const base = { a: pair[0].a, b: pair[0].b };
    const pick = every(pair, CHART_POINTS);
    const rs = pair.at(-1).a / base.a - 1;
    const rm = pair.at(-1).b / base.b - 1;
    host.replaceChildren(
      multiLineChart([
        { name: `${sector} (${etf})`, color: 'var(--brand-01)',
          points: pick.map((p) => ({ date: p.date, value: p.a / base.a - 1 })) },
        { name: `S&P 500 (${MARKET_ETF})`, color: 'var(--chart-01)',
          points: pick.map((p) => ({ date: p.date, value: p.b / base.b - 1 })) },
      ], {
        height: 300,
        valueFmt: (v) => pct(v, { sign: true, dp: 0 }),
        labelFmt: (d) => fmtDate(d, { month: 'short', year: '2-digit' }),
      }),
      statGrid([
        [`${sector} total return`, retCell(rs), `over ${w.label}`],
        ['S&P 500 total return', retCell(rm), `over ${w.label}`],
        ['Excess', retCell(rs - rm), 'sector less market'],
      ]),
    );
  }
  draw();

  const ra = computeReturns(a, RETURN_SPANS);
  const rb = computeReturns(b, RETURN_SPANS);
  const spans = ['1M', '6M', '1Y', '3Y', '5Y'];

  return el('div', {}, [
    el('p', { class: 'mh-section-description', text: 'Both lines are price return from the first close in the window, so two funds on very different price scales can share an axis. Distributions are excluded, and the sector line carries its fund’s fee.' }),
    strip,
    host,
    el('div', { class: 'mi-table__scroll gp-horizons' }, [
      el('table', { class: 'mi-table' }, [
        el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: 'At fixed horizons' }),
          ...spans.map((span) => el('th', { class: 'mi-table__n', scope: 'col', text: span }))])]),
        el('tbody', {}, [
          [`${sector} (${etf})`, ra], [`S&P 500 (${MARKET_ETF})`, rb], ['Excess', null],
        ].map(([label, set]) => el('tr', {}, [
          el('td', { class: 'mi-table__id', text: label }),
          ...spans.map((span) => el('td', { class: 'mi-table__n' }, [retCell(set
            ? set?.[span]
            : (isNum(ra?.[span]) && isNum(rb?.[span]) ? ra[span] - rb[span] : null))])),
        ]))),
      ]),
    ]),
    el('p', { class: 'mh-panel-note', text: 'A window the price history is too short to cover reads n/a rather than being computed from whatever is there — six years of closes are fetched, so the five-year column is the first to run out.' }),
  ]);
}

/* ==========================================================================
   An industry's performance, when nothing is published that follows one

   FMP has no industry index and no fund-to-industry classification — a fund's
   own `industry` field describes the fund, not what it holds — so there is no
   symbol to quote for "Semiconductors". Name-matching funds to industries was
   measured before this was built and reached 71 of 148 industries, pairing
   `Industrial - Machinery` with the Dow and `Credit Services` with the whole
   financials sector on the way. A wrong fund reads as a recommendation, so
   neither half of this section guesses.

   Instead both halves are bought, and each says what it costs first:

   **The line** is built from the industry's own members. Shares are derived
   once (`marketCap / price`) and held fixed, so the index is a real
   share-weighted basket rather than today's weights applied backwards — a
   winner's weight in it grows with its price, the way an index does between
   rebalances. Ten requests, one per member.

   **The funds** come from `etf-asset-exposure`, which answers the question the
   other way round: for a stock, which funds hold it and at what weight. A fund
   holding several of an industry's largest members, heavily, is a fund
   following that industry — established from holdings rather than from a name.
   Five requests, and they are large.
   ========================================================================== */

/** Members the index is built from, and members the fund search asks about. */
const INDEX_MEMBERS = 10;
const EXPOSURE_MEMBERS = 5;
/** A holding weight outside this range is a derivative position, not a slice. */
const SANE_WEIGHT = (w) => isNum(w) && w > 0 && w <= 100;

function industryPerformance(industry, parent, universe, nav) {
  const moved = (universe.ok ? universe.rows : []).filter((r) => r.quoted && isNum(r.change))
    .sort((a, b) => b.change - a.change);
  const movers = (list, title) => el('div', { class: 'gp-movers' }, [
    el('p', { class: 'gp-stat__k', text: title }),
    ...list.map((r) => el('button', {
      type: 'button', class: 'mh-idea', title: r.name, onclick: () => nav.goSymbol?.(r.symbol),
    }, [el('span', { text: r.symbol }), el('span', { class: 'gp-idea__v' }, [signed(r.change)])])),
  ]);

  return el('div', {}, [
    el('p', { class: 'mh-section-description', text: `No index and no fund follow ${industry} on its own${parent ? `, and the nearest published line is ${parent}’s` : ''} — so what is here is built from the industry’s own members, and it is bought rather than loaded.` }),
    indexBlock(industry, universe),
    exposureBlock(industry, universe, nav),
    moved.length >= 2 ? el('div', { class: 'gp-movers__pair' }, [
      movers(moved.slice(0, 5), 'Up most today'),
      movers(moved.slice(-5).reverse(), 'Down most today'),
    ]) : emptyState('skipped', 'Member quotes come from FMP. Add your API key in Settings.', true),
    parent ? el('button', { type: 'button', class: 'mh-see-all', onclick: () => nav.goView?.('sectors', sectorSlug(parent)) },
      [`See ${parent} against the S&P 500`, arrow()]) : null,
  ].filter(Boolean));
}

/* ---------- the line, built from the members -------------------------------- */

function indexBlock(industry, universe) {
  const members = (universe.ok ? universe.rows : [])
    .filter((r) => isNum(r.marketCap) && r.marketCap > 0 && isNum(r.price) && r.price > 0)
    .slice(0, INDEX_MEMBERS);
  const host = el('div', { class: 'gp-index' });
  if (!members.length || !hasApiKey()) {
    host.append(emptyState('skipped', 'Building an index needs a live FMP key and member prices.', true));
    return host;
  }

  const covered = members.reduce((t, r) => t + r.marketCap, 0) / (universe.total || 1) * 100;
  const progress = el('span', { class: 'mi-progress', 'aria-live': 'polite' });
  const button = el('button', {
    type: 'button', class: 'mi-load',
    text: `Build a ${industry} index from its ${members.length} largest — one request each`,
    onclick: async () => {
      button.disabled = true;
      button.textContent = 'Building…';
      const built = await buildMemberIndex(members, (done, total) => { progress.textContent = ` ${done} of ${total}…`; });
      progress.textContent = '';
      host.replaceChildren(built.error
        ? emptyState('error', built.error)
        : indexChart(industry, built, covered, members.length));
    },
  });

  host.append(el('div', { class: 'gp-consent' }, [button, progress]),
    el('p', { class: 'mh-panel-note', text: `These ${members.length} companies are ${pct(covered, { already: true, dp: 0 })} of the industry’s market value. Their daily closes are one request each, cached for the session once loaded.` }));
  return host;
}

/**
 * The basket, and the market to put beside it.
 *
 * Share counts come from `marketCap / price` today and are held fixed across
 * the window, which is what makes this an index rather than a weighted average
 * of returns: a member's influence moves with its own price, as it does in a
 * real index between rebalances. What it cannot fix is membership — the
 * basket is today's ten, so a company that left the industry or the market is
 * absent from its own past, and the note under the chart says so.
 */
async function buildMemberIndex(members, onProgress) {
  const from = new Date(Date.now() - 6 * 365 * 864e5).toISOString().slice(0, 10);
  let done = 0;
  const [series, market] = await Promise.all([
    mapLimited(members, async (m) => {
      const res = await fetchFor('prices', m.symbol, { from });
      onProgress?.(++done, members.length + 1);
      return { ...m, shares: m.marketCap / m.price, points: res.status === 'ok' ? normalisePrices(res.data) : [] };
    }, 4),
    fetchFor('prices', MARKET_ETF, { from }).then((res) => {
      onProgress?.(++done, members.length + 1);
      return res.status === 'ok' ? normalisePrices(res.data) : [];
    }),
  ]);

  const usable = series.filter((m) => m.points.length > 1);
  if (usable.length < 3) return { error: 'Fewer than three members returned a usable price history, which is not an index.' };

  /* The basket needs one date range every member covers. The newest listing
     decides it, so the shortest history is dropped and the range recomputed
     until a year of overlap survives — a member that listed last month should
     not truncate the other nine to a month. */
  const kept = [...usable].sort((a, b) => a.points[0].date.localeCompare(b.points[0].date));
  let basket = [...kept];
  let dropped = [];
  let common = [];
  while (basket.length >= 3) {
    const latestStart = basket.reduce((acc, m) => (m.points[0].date > acc ? m.points[0].date : acc), '');
    const maps = basket.map((m) => new Map(m.points.map((p) => [p.date, p.price])));
    common = basket[0].points.filter((p) => p.date >= latestStart && maps.every((map) => isNum(map.get(p.date))))
      .map((p) => ({ date: p.date, level: basket.reduce((t, m, i) => t + m.shares * maps[i].get(p.date), 0) }));
    if (common.length > 250 || basket.length === 3) break;
    dropped = [...dropped, basket.pop()];
  }
  if (common.length < 2) return { error: 'The members have too little overlapping price history to build an index.' };

  return { points: common.map((p) => ({ date: p.date, price: p.level })), market, basket, dropped };
}

/** The built index against the market, on the same windows a sector uses. */
function indexChart(industry, built, covered, asked) {
  const host = el('div');
  let active = '1Y';
  const strip = el('div', { class: 'rangesel' }, WINDOWS.map((w) => el('button', {
    type: 'button', class: w.key === active ? 'is-on' : '', text: w.label,
    onclick: (event) => {
      active = w.key;
      [...strip.children].forEach((c) => c.classList.toggle('is-on', c === event.currentTarget));
      draw();
    },
  })));

  function draw() {
    const w = WINDOWS.find((x) => x.key === active);
    const cut = w.days ? Date.now() - w.days * 864e5 : Date.UTC(new Date().getUTCFullYear(), 0, 1);
    const pair = align(built.points, built.market, cut);
    if (pair.length < 2) {
      host.replaceChildren(emptyState('unavailable', 'The basket has no history across this window.', true));
      return;
    }
    const base = { a: pair[0].a, b: pair[0].b };
    const pick = every(pair, CHART_POINTS);
    const ri = pair.at(-1).a / base.a - 1;
    const rm = pair.at(-1).b / base.b - 1;
    host.replaceChildren(
      multiLineChart([
        { name: `${industry} (${built.basket.length} members)`, color: 'var(--brand-01)',
          points: pick.map((p) => ({ date: p.date, value: p.a / base.a - 1 })) },
        { name: `S&P 500 (${MARKET_ETF})`, color: 'var(--chart-01)',
          points: pick.map((p) => ({ date: p.date, value: p.b / base.b - 1 })) },
      ], {
        height: 300,
        valueFmt: (v) => pct(v, { sign: true, dp: 0 }),
        labelFmt: (d) => fmtDate(d, { month: 'short', year: '2-digit' }),
      }),
      statGrid([
        [`${industry} index`, retCell(ri), `over ${w.label}`],
        ['S&P 500 total return', retCell(rm), `over ${w.label}`],
        ['Excess', retCell(ri - rm), 'industry less market'],
      ]),
    );
  }
  draw();

  return el('div', {}, [
    strip,
    host,
    el('p', { class: 'mh-panel-note', text: [
      `This index is this report’s own, not a published one: a share-weighted basket of ${built.basket.length} of the ${asked} largest members — ${pct(covered, { already: true, dp: 0 })} of the industry’s market value — with share counts derived from today’s capitalisation and held fixed.`,
      built.dropped.length
        ? `${built.dropped.map((m) => m.symbol).join(', ')} ${built.dropped.length === 1 ? 'was' : 'were'} left out: too little price history to span the others.`
        : '',
      'Membership is today’s, so a company that has left the industry is absent from its own past, and the basket carries no distributions.',
    ].filter(Boolean).join(' ') }),
  ]);
}

/* ---------- the funds that hold it ------------------------------------------ */

/**
 * Which funds follow this industry, answered from holdings.
 *
 * `etf-asset-exposure` returns every fund holding one symbol and its weight in
 * each. Asked of the five largest members and intersected, it finds the funds
 * genuinely concentrated in the industry rather than the ones whose name
 * happens to contain the word. The payload is the cost: about half a megabyte
 * per symbol, which is why this waits to be asked and says so.
 */
function exposureBlock(industry, universe, nav) {
  const members = (universe.ok ? universe.rows : []).slice(0, EXPOSURE_MEMBERS);
  const host = el('div', { class: 'gp-exposure' });
  if (!members.length || !hasApiKey()) return host;

  const progress = el('span', { class: 'mi-progress', 'aria-live': 'polite' });
  const button = el('button', {
    type: 'button', class: 'mi-load',
    text: `Find the funds holding ${industry} — ${members.length} requests, large payloads`,
    onclick: async () => {
      button.disabled = true;
      button.textContent = 'Searching…';
      const found = await fundsHolding(members, (done, total) => { progress.textContent = ` ${done} of ${total}…`; });
      progress.textContent = '';
      host.replaceChildren(found.length
        ? exposureTable(industry, found, members, nav)
        : emptyState('unavailable', `No fund holds more than one of ${industry}’s largest members at a weight this feed reports.`, true));
    },
  });

  host.append(el('div', { class: 'gp-consent' }, [button, progress]),
    el('p', { class: 'mh-panel-note', text: `Asked of ${members.map((m) => m.symbol).join(', ')} — the industry’s largest — and kept where a fund holds more than one of them. This is established from what the funds hold, not from what they are called.` }));
  return host;
}

async function fundsHolding(members, onProgress) {
  let done = 0;
  const results = await mapLimited(members, async (m) => {
    const res = await fetchHubFeed('etfExposure', { symbol: m.symbol });
    onProgress?.(++done, members.length);
    return { symbol: m.symbol, rows: res.status === 'ok' ? res.data : [] };
  }, 2);

  const funds = new Map();
  for (const { symbol, rows } of results) {
    // The feed repeats a holding and reports derivative positions with weights
    // far above a hundred; neither is a slice of a portfolio.
    const seen = new Set();
    for (const row of rows) {
      const fund = String(row.symbol || '').toUpperCase();
      const weight = Number(row.weightPercentage);
      if (!fund || seen.has(fund) || !SANE_WEIGHT(weight)) continue;
      seen.add(fund);
      const cur = funds.get(fund) || { fund, held: [], weight: 0 };
      cur.held.push(symbol);
      cur.weight += weight;
      funds.set(fund, cur);
    }
  }

  /* **A portfolio's weights in five holdings cannot exceed the portfolio.**
     Four funds came back claiming 190% and more across the five, which is not
     a weight — the same feed reports a leveraged position as 21,217% — so the
     sum is the test that separates a reported weight from a reported number.
     Every fund that actually tracks this industry passes it: SMH at 44% across
     the five, SOXX at 40%, and the Amundi UCITS line at 57%. */
  return [...funds.values()]
    .filter((f) => f.held.length > 1 && f.weight <= 100)
    .sort((a, b) => b.held.length - a.held.length || b.weight - a.weight)
    .slice(0, 40);
}

/** One fund, one row: the same fund lists in a dozen places. */
const fundIdentity = (name) => String(name || '').toLowerCase()
  .replace(/\b(?:ucits|etf|etc|acc|dist|inc|plc|fund|shares?|class\s+[a-z]|[a-z]{3}\s+hedged|hedged|screened|esg)\b/g, '')
  .replace(/[^a-z0-9]/g, '');

function exposureTable(industry, found, members, nav) {
  const host = el('div');
  quoteMap(found.map((f) => f.fund)).then((quotes) => {
    /* Quoted first, then one row per fund. `etf/asset-exposure` answers for
       every listing of a fund worldwide — seven lines of the same Amundi
       tracker came back for semiconductors — and an unquotable line is a row a
       reader can do nothing with, so the venue that quotes is the one kept. */
    const collapsed = new Map();
    for (const f of found) {
      const quote = quotes.get(f.fund);
      if (!quote || !isNum(quote.price)) continue;
      const key = fundIdentity(quote.name) || f.fund;
      const row = { ...f, name: quote.name || f.fund, price: quote.price, change: quote.changesPercentage ?? null };
      const held = collapsed.get(key);
      const better = !held || (!row.fund.includes('.') && held.fund.includes('.')) || row.weight > held.weight;
      if (better) collapsed.set(key, row);
    }
    const rows = [...collapsed.values()]
      .sort((a, b) => b.held.length - a.held.length || b.weight - a.weight)
      .slice(0, 10);
    if (!rows.length) {
      host.replaceChildren(emptyState('unavailable', `No fund holding ${industry}'s largest members could be quoted.`, true));
      return;
    }
    host.replaceChildren(
      denseTable([
        { key: 'fund', label: 'Fund', identity: true,
          render: (r) => el('button', { type: 'button', class: 'mkticker', text: r.fund, title: r.name,
            onclick: () => nav.goSymbol?.(r.fund) }) },
        { key: 'name', label: 'Name', render: (r) => el('span', { class: 'seccell__n', text: r.name }) },
        { key: 'count', label: 'Members held', numeric: true, value: (r) => r.held.length,
          render: (r) => el('span', { title: r.held.join(', '), text: `${r.held.length} of ${members.length}` }) },
        { key: 'weight', label: 'Combined weight', numeric: true,
          render: (r) => el('span', { text: pct(r.weight, { already: true, dp: 1 }) }) },
        { key: 'price', label: 'Price', numeric: true, render: (r) => el('span', { text: isNum(r.price) ? dec(r.price, 2) : 'n/a' }) },
        { key: 'change', label: 'Day', numeric: true, render: (r) => signed(r.change) },
      ], rows, { sort: { key: 'weight', dir: -1 } }),
      el('p', { class: 'mh-panel-note', text: `Combined weight is the sum of this fund’s weights in the ${members.length} members asked about, so a fund concentrated in ${industry} scores high and a broad market fund holding all five at a fraction of a per cent does not. It is a ranking of exposure, not a recommendation, and the funds are not graded — nothing in this report scores a basket.` }),
    );
  });
  host.append(emptyState('loading', '', true));
  return host;
}


/* ---------- what a sector is made of ---------------------------------------- */

function industryTable(sector, universe, indPerf, nav) {
  // The vendor's industry snapshot, keyed by name so the session column can be
  // folded in where it matches.
  const session = new Map();
  if (indPerf.status === 'ok') {
    for (const r of indPerf.data || []) {
      const name = r.industry || r.sector;
      if (!name || !isNum(r.averageChange)) continue;
      const cur = session.get(name) || { total: 0, n: 0 };
      cur.total += r.averageChange; cur.n += 1;
      session.set(name, cur);
    }
  }
  const rows = universe.industries.map((r) => {
    const snap = session.get(r.industry);
    return { ...r, day: snap ? snap.total / snap.n : null };
  });

  return el('div', {}, [
    el('p', { class: 'mh-section-description', text: `${rows.length} industries, weighted by each one’s share of the sector’s market capitalisation rather than by how many companies it holds. The session column is the vendor’s own industry snapshot, which counts members equally, so it will not agree with the weight beside it.` }),
    denseTable([
      { key: 'industry', label: 'Industry', identity: true,
        render: (r) => el('button', { type: 'button', class: 'mkticker', text: r.industry,
          title: `Open the ${r.industry} page`, onclick: () => nav.goIndustry?.(r.industry) }) },
      { key: 'weight', label: 'Weight', numeric: true, render: (r) => el('span', { text: isNum(r.weight) ? pct(r.weight) : 'n/a' }) },
      { key: 'cap', label: 'Market cap', numeric: true, render: (r) => el('span', { text: r.cap > 0 ? money(r.cap) : 'n/a' }) },
      { key: 'n', label: 'Companies', numeric: true, render: (r) => el('span', { text: dec(r.n, 0) }) },
      { key: 'day', label: 'Day', numeric: true, render: (r) => signed(r.day) },
    ], rows, { sort: { key: 'weight', dir: -1 } }),
  ]);
}

/* ---------- the members ------------------------------------------------------ */

/**
 * The biggest companies, and optionally their grades.
 *
 * The rows come from the screener call the whole page shares, so this costs
 * nothing extra. Grading them is two feeds per company — a hundred requests
 * for fifty rows — which is why it waits for a click, and why the button says
 * what it costs before it is pressed.
 */
function companyTable(universe, stats, parent, nav) {
  const rows = universe.rows.slice(0, TOP_N);
  const host = el('div');
  const status = el('span', { class: 'mi-progress', 'aria-live': 'polite' });

  const grade = async () => {
    const lookup = sectorLookup(stats, parent);
    let done = 0;
    await mapLimited(rows, async (r) => {
      const [ratios, metrics] = await Promise.all([
        fetchFor('ratiosTtm', r.symbol),
        fetchFor('metricsTtm', r.symbol),
      ]);
      r.lite = scoreLite({
        ratios: ratios.status === 'ok' ? ratios.data : null,
        metrics: metrics.status === 'ok' ? metrics.data : null,
      }, lookup);
      status.textContent = ` ${++done} of ${rows.length}…`;
    }, 4);
    status.textContent = '';
    draw(true);
  };

  function draw(graded = false) {
    const columns = [
      { key: 'name', label: 'Company', identity: true, render: (r) => companyCell(r, nav) },
      { key: 'price', label: 'Price', numeric: true, render: (r) => el('span', { text: isNum(r.price) ? dec(r.price, 2) : 'n/a' }) },
      { key: 'change', label: 'Day', numeric: true, render: (r) => signed(r.change) },
      { key: 'marketCap', label: 'Market cap', numeric: true, render: (r) => el('span', { text: isNum(r.marketCap) ? money(r.marketCap) : 'n/a' }) },
      { key: 'weight', label: 'Weight', numeric: true, render: (r) => el('span', { text: isNum(r.weight) ? pct(r.weight) : 'n/a' }) },
      ...(graded ? [
        { key: 'quant', label: 'Quant', numeric: true, value: (r) => r.lite?.score ?? null,
          render: (r) => (isNum(r.lite?.score) ? gradePill(r.lite.score, letterFor(r.lite.score)) : el('span', { class: 'subtle', text: '—' })) },
        ...FACTOR_KEYS.map((k) => ({
          key: `f:${k}`, label: shortFactor(k), numeric: true, value: (r) => r.lite?.factors?.[k]?.score ?? null,
          render: (r) => {
            const v = r.lite?.factors?.[k]?.score;
            return isNum(v) ? gradePill(v, letterFor(v)) : el('span', { class: 'subtle', text: '—' });
          },
        })),
      ] : []),
    ];

    const button = el('button', {
      type: 'button', class: 'mi-load',
      text: `Grade these ${rows.length} — two feeds per company`,
      onclick: async () => { button.disabled = true; button.textContent = 'Grading…'; await grade(); },
    });

    host.replaceChildren(...[
      denseTable(columns, rows, { sort: { key: 'marketCap', dir: -1 } }),
      graded ? null : el('div', { class: 'gp-consent' }, [button, status]),
      el('p', { class: 'mh-panel-note', text: [
        universe.listingCount !== universe.companyCount
          ? `${dec(universe.listingCount, 0)} listings collapsed to ${dec(universe.companyCount, 0)} companies; the largest ${rows.length} are shown.`
          : `The largest ${rows.length} of ${dec(universe.companyCount, 0)} companies.`,
        'Weight is the share of the group’s total market capitalisation, so the column sums to less than 100% — the tail below the top fifty is the rest.',
        graded
          ? `Grades are the reduced-set score — a handful of ratios per factor against ${parent || 'the parent sector'}’s distribution — not the full report grade. Open a company for that.`
          : 'Grading fetches two feeds per company, so it waits until you ask.',
      ].join(' ') }),
    ].filter(Boolean));
  }

  draw();
  return host;
}

/* ---------- the wire --------------------------------------------------------- */

function newsBlock(name, news, nav) {
  const stories = (news.status === 'ok' ? news.data : [])
    .filter((n) => n && (n.title || n.text))
    .sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate))
    .slice(0, 12);

  if (news.status !== 'ok') {
    return emptyState(news.status === 'skipped' ? 'skipped' : news.status,
      news.status === 'skipped' ? 'Company news comes from FMP. Add your API key in Settings.'
        : `No news was returned for ${name}’s companies.`);
  }
  return el('div', {}, [
    el('p', { class: 'mh-section-description', text: `FMP publishes no sector- or industry-tagged news feed, so this is coverage of the ${news.symbols?.length || 0} largest ${name} companies by market capitalisation rather than a group wire. It will miss a story about a smaller constituent, and it will miss macro coverage that names no company at all. Not scored, not ranked and not sentiment-tagged.` }),
    stories.length
      ? el('div', { class: 'secnews' }, stories.map((n) => storyRow(n, nav)))
      : emptyState('ok', `No recent stories for ${name}’s largest companies.`, true),
  ]);
}

/** One headline: outlet, time, the tickers it is filed under, and the link out. */
function storyRow(n, nav) {
  const tickers = String(n.symbol || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
  return el('article', { class: 'secnews__i' }, [
    el('div', { class: 'secnews__m' }, [
      el('span', { class: 'secnews__o', text: n.site || n.publisher || 'Unknown outlet' }),
      el('span', { class: 'acard__dot', text: '·' }),
      el('time', { datetime: n.publishedDate || '', text: ago(n.publishedDate) }),
    ]),
    n.url
      ? el('a', { class: 'secnews__t', href: n.url, target: '_blank', rel: 'noopener noreferrer',
        text: n.title || '(untitled)' })
      : el('span', { class: 'secnews__t', text: n.title || '(untitled)' }),
    tickers.length ? el('div', { class: 'secnews__k' }, tickers.map((t) => el('button', {
      type: 'button', class: 'mkticker mkticker--logo',
      title: `Open the ${t} report`,
      onclick: () => nav.goSymbol?.(t),
    }, [logo(logoUrl(t), t, { size: 'xs', fallback: 'none' }), el('span', { text: t })]))) : null,
  ].filter(Boolean));
}

/* ---------- the distribution behind every grade ------------------------------ */

function distributionBlock(sector, stats) {
  const tbl = stats?.sectors?.[sector];
  const seeded = stats?.source === 'seed';
  if (!tbl) {
    return emptyState('unavailable', `No distribution is loaded for ${sector}, so nothing in this sector can be ranked. Every ratio for a company here shows its figure with no grade beside it.`);
  }
  const metrics = Object.keys(tbl.metrics || {});
  const overall = tbl.overall;

  return el('div', {}, [
    el('p', { class: 'mh-section-description', text: 'What every grade for a company in this sector is measured against. A ratio is ranked as a percentile within this distribution, and the percentile becomes the grade.' }),
    statGrid([
      ['Companies in the sample', isNum(tbl.count) ? dec(tbl.count, 0) : 'n/a', ''],
      ['Ratios with a distribution', String(metrics.length), 'anything outside this list cannot be graded'],
      ['Table built', stats.generatedAt ? fmtDate(stats.generatedAt) : 'n/a', ''],
      ['Source', seeded ? 'Modelled seed' : 'Measured from FMP', seeded ? 'not measured' : 'measured'],
    ]),
    overall?.bins?.length ? el('div', { class: 'gp-hist' }, [
      el('p', { class: 'mh-panel-note', text: `How composite scores are spread across this sector — ${dec(overall.n, 0)} companies, ${overall.bins.length} bins from 0 to ${overall.max ?? MAX_SCORE}.` }),
      histogram(overall),
    ]) : null,
    seeded ? notice('<b>This distribution is modelled, not measured.</b> Its smooth symmetry is the giveaway — a real sector is lumpy. Every grade for every company in this sector inherits that, including the ones in the table above.', 'notice--error') : null,
  ].filter(Boolean));
}

/* ---------- where else to go ------------------------------------------------- */

function siblingSectors(sector, perf, nav) {
  const rows = SECTORS.map((s) => ({ sector: s, change: averageFor(perf, s, 'averageChange') }))
    .sort((a, b) => (b.change ?? -99) - (a.change ?? -99));
  return el('div', { class: 'mh-ideas__rail', role: 'group', 'aria-label': 'Every sector' },
    rows.map((r) => el('button', {
      type: 'button', class: `mh-idea${r.sector === sector ? ' is-active' : ''}`,
      'aria-pressed': String(r.sector === sector),
      onclick: () => nav.goView?.('sectors', sectorSlug(r.sector)),
    }, [el('span', { text: r.sector }), el('span', { class: 'gp-idea__v' }, [signed(r.change)])])));
}

function siblingIndustries(industry, parent, indPerf, nav) {
  if (!parent) return emptyState('unavailable', 'This industry’s parent sector could not be read from its members, so its neighbours are unknown.', true);
  return el('div', {}, [
    el('p', { class: 'mh-section-description', text: `The other industries inside ${parent}, with the vendor’s session snapshot for each.` }),
    el('button', { type: 'button', class: 'mh-see-all', onclick: () => nav.goView?.('sectors', sectorSlug(parent)) },
      [`Open ${parent}`, arrow()]),
  ]);
}

/* ---------- the dense table both use ----------------------------------------- */

/**
 * The board's own table, given rows and columns: every column sorts, the first
 * one sticks, and the whole thing scrolls sideways inside its own scroller
 * rather than widening the page.
 */
function denseTable(columns, rows, { sort: initial = null } = {}) {
  const host = el('div', { class: 'mi-table__scroll' });
  let sort = initial || { key: columns[0].key, dir: 1 };
  const valueOf = (row, column) => (column.value ? column.value(row) : row[column.key]);

  const draw = () => {
    const ordered = [...rows].sort((a, b) => {
      const av = valueOf(a, columns.find((c) => c.key === sort.key) || columns[0]);
      const bv = valueOf(b, columns.find((c) => c.key === sort.key) || columns[0]);
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return (typeof av === 'string' ? av.localeCompare(String(bv)) : av - bv) * sort.dir;
    });
    host.replaceChildren(el('table', { class: 'mi-table' }, [
      el('thead', {}, [el('tr', {}, columns.map((column) => {
        const active = sort.key === column.key;
        return el('th', {
          class: `${column.numeric ? 'mi-table__n' : ''}${active ? ' is-sorted' : ''}`.trim(),
          scope: 'col', 'aria-sort': active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none',
        }, [el('button', {
          type: 'button',
          onclick: () => {
            sort = active ? { key: column.key, dir: sort.dir * -1 }
              : { key: column.key, dir: column.identity ? 1 : -1 };
            draw();
          },
        }, [column.label, active ? el('span', { class: 'mi-sort', 'aria-hidden': 'true', text: sort.dir === 1 ? '↑' : '↓' }) : null].filter(Boolean))]);
      }))]),
      el('tbody', {}, ordered.map((row) => el('tr', {}, columns.map((column) => el('td', {
        class: `${column.identity ? 'mi-table__id' : ''}${column.numeric ? ' mi-table__n' : ''}`.trim(),
      }, [column.render(row)]))))),
    ]));
  };
  draw();
  return host;
}

const retCell = (v) => (isNum(v)
  ? el('span', { class: signClass(v), text: pct(v, { sign: true }) })
  : el('span', { class: 'subtle', text: 'n/a' }));

function companyCell(r, nav) {
  const fb = () => el('span', { class: 'mkrow__logo mkrow__logo--fb', text: (r.symbol || '?')[0] });
  const img = el('img', { class: 'mkrow__logo', src: logoUrl(r.symbol), alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(fb()));

  return el('span', { class: 'seccell' }, [
    img,
    el('span', { class: 'seccell__b' }, [
      el('button', {
        type: 'button', class: 'mkticker', text: r.symbol,
        title: `Open the ${r.symbol} report`,
        onclick: () => nav.goSymbol?.(r.symbol),
      }),
      el('span', { class: 'seccell__n', title: `${r.name}${r.industry ? ` · ${r.industry}` : ''}`, text: r.name }),
    ]),
  ]);
}

const shortFactor = (k) => ({
  valuation: 'Val', growth: 'Grw', profitability: 'Prof', health: 'Health', momentum: 'Mom',
}[k] || FACTOR_BY_KEY[k]?.title || k);

function histogram(overall) {
  const bins = overall.bins || [];
  const max = Math.max(...bins, 1);
  const step = (overall.max ?? MAX_SCORE) / bins.length;

  return el('div', { class: 'sechist' }, bins.map((n, i) => {
    const lo = (i * step).toFixed(1);
    const hi = ((i + 1) * step).toFixed(1);
    return el('div', { class: 'sechist__col', title: `${n} companies scoring ${lo}–${hi}` }, [
      el('i', { class: 'sechist__bar', style: { height: `${(n / max) * 100}%` } }),
      el('span', { class: 'sechist__k', text: i % 4 === 0 ? lo : '' }),
    ]);
  }));
}
