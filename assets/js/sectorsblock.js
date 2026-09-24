/* ==========================================================================
   Vanlior — the Sectors block

   Market Data's sector breakdown: a table of sectors on the left, a treemap
   on the right, and clicking a sector swaps the treemap for the industries
   inside it.

   ---------------------------------------------------------------------------
   Three requests for the whole thing
   ---------------------------------------------------------------------------

   One `fetchScreener` call returns every listing with its sector, industry
   and market cap. Everything structural comes out of that one payload:

     - the market weight of each sector, and of each industry inside one
     - which industries belong to which sector, which neither performance
       feed carries

   The other two are the sector and industry performance snapshots, which
   supply the day's average change the tiles are coloured by.

   ---------------------------------------------------------------------------
   Where the year-to-date column comes from, and where it cannot come from
   ---------------------------------------------------------------------------

   Not from the sector feed. `historical-sector-performance` returns a *daily
   average change* per sector, not a cumulative return, and compounding nine
   months of equal-weight daily averages produces a daily-rebalanced index that
   drifts from a real year-to-date return by a wide and unstateable margin.
   That reasoning stands and this file used to end there, with the day's change
   in the column.

   It comes from the funds instead. Each sector has a tracking ETF, and
   `stock-price-change` returns that fund's real year-to-date price return —
   cumulative, capitalisation-weighted, which is what "the sector is up 12%"
   means. **It takes a comma-separated list**, so all eleven and the market's
   own come back in one request rather than eleven, which is the whole reason
   this is affordable in a block that loads with the page.

   Two things follow from the number being the fund's. A fund carries its own
   fee and excludes its distributions, so this is a price return net of costs
   rather than the index's; and the tiles stay coloured by the *session*,
   because an industry has no fund and therefore no year-to-date of its own.
   Each tile prints the number it is coloured by, and the map says so.
   ========================================================================== */

import { el, isNum, pct } from './util.js';
import { heatTone, heatLegend } from './ui.js';
import { fetchScreener, fetchMarket, fetchHubFeed, hasApiKey } from './fmp.js';
import { SECTOR_ETF, MARKET_ETF } from './nav.js';
import { dedupe } from './ideas.js';
import { isUSListing } from './markethub-data.js';
import { emptyState, heading, arrow } from './markethub-ui.js';

/** Industries drawn inside one sector; the tail is grouped rather than dropped. */
const MAX_TILES = 14;
/** A tile below this share of the parent is unreadable at any sensible size. */
const MIN_SHARE = 0.004;

const ALL = '__all__';

/* ==========================================================================
   The treemap

   Squarified: the classic Bruls/Huizing/van Wijk pass. Tiles are laid in rows
   across the shorter side, and a row is closed when adding the next tile would
   make its worst aspect ratio worse. Plain proportional slicing would give the
   small sectors slivers a label cannot sit in, which is the whole reason the
   algorithm exists.
   ========================================================================== */

/** The worst aspect ratio in `row` if it were laid along `side`. */
function worst(row, side, sum) {
  if (!row.length || sum <= 0 || side <= 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

/**
 * `items` is `[{ value, ... }]`; returns each with `{ x, y, w, h }` in per cent
 * of the container, so the caller can place them with CSS and let the browser
 * do the pixels.
 */
function squarify(items, x, y, w, h, out = []) {
  const live = items.filter((i) => i.value > 0);
  if (!live.length) return out;
  if (live.length === 1) {
    out.push({ ...live[0], x, y, w, h });
    return out;
  }

  const total = live.reduce((a, i) => a + i.value, 0);
  const side = Math.min(w, h);
  // Scale values into area units so `worst` compares like with like.
  const scale = (w * h) / total;

  const row = [];
  let rowSum = 0;
  let i = 0;
  for (; i < live.length; i++) {
    const v = live[i].value * scale;
    const next = worst([...row, v], side, rowSum + v);
    if (row.length && next > worst(row, side, rowSum)) break;
    row.push(v);
    rowSum += v;
  }

  const placed = live.slice(0, row.length);
  if (w >= h) {
    const rowW = rowSum / h;
    let cy = y;
    placed.forEach((item, k) => {
      const ih = (row[k] / rowSum) * h;
      out.push({ ...item, x, y: cy, w: rowW, h: ih });
      cy += ih;
    });
    squarify(live.slice(row.length), x + rowW, y, w - rowW, h, out);
  } else {
    const rowH = rowSum / w;
    let cx = x;
    placed.forEach((item, k) => {
      const iw = (row[k] / rowSum) * w;
      out.push({ ...item, x: cx, y, w: iw, h: rowH });
      cx += iw;
    });
    squarify(live.slice(row.length), x, y + rowH, w, h - rowH, out);
  }
  return out;
}

/** One treemap over `rows` of `{ label, weight, change }`. `linksIndustries`
    says an industry tile opens its page, so its tooltip can say so too. */
function treemap(rows, { onPick = null, linksIndustries = false } = {}) {
  const live = rows.filter((r) => r.weight > 0).sort((a, b) => b.weight - a.weight);
  if (!live.length) return emptyState('unavailable', 'Nothing to map here.', true);

  const total = live.reduce((a, r) => a + r.weight, 0);
  const tiles = squarify(live.map((r) => ({ ...r, value: r.weight / total })), 0, 0, 100, 100);

  return el('div', { class: 'sb-map' }, tiles.map((t) => {
    const share = t.value;
    const body = [
      el('span', { class: 'sb-map__k', text: t.label }),
      el('span', { class: 'sb-map__v', text: isNum(t.change) ? pct(t.change, { already: true, sign: true }) : 'n/a' }),
    ];
    const attrs = {
      class: `sb-map__t is-${heatTone(t.change)}${share < 0.035 ? ' is-tiny' : share < 0.09 ? ' is-small' : ''}`,
      style: { left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%` },
      title: `${t.label} · ${pct(t.weight, { already: true })} of market cap`
        + `${isNum(t.change) ? ` · ${pct(t.change, { already: true, sign: true })} today` : ''}`
        + `${t.industry && linksIndustries ? ' · opens the industry page' : ''}`,
    };
    return onPick
      ? el('button', { type: 'button', ...attrs, onclick: () => onPick(t) }, body)
      : el('div', attrs, body);
  }));
}

/* ==========================================================================
   The data
   ========================================================================== */

const rowsOf = (r) => (Array.isArray(r?.data) ? r.data : []);

/**
 * Weights and day changes, by sector and by industry.
 *
 * The screener is the only thing here that knows an industry's sector, so the
 * mapping is built from it rather than from the performance feeds — those
 * return a flat list with no parent.
 */
async function loadSectors() {
  if (!hasApiKey()) return { status: 'skipped' };

  const funds = [...new Set([...Object.values(SECTOR_ETF), MARKET_ETF])];
  const [universe, sectorPerf, industryPerf, changes] = await Promise.all([
    fetchScreener({ country: 'US', isEtf: false, isFund: false, isActivelyTrading: true,
      includeAllShareClasses: false, marketCapMoreThan: 1e8, limit: 5000 }),
    fetchMarket('sectorPerf'),
    fetchMarket('industryPerf'),
    fetchHubFeed('priceChanges', { symbol: funds.join(',') }),
  ]);
  if (universe.status !== 'ok') return { status: universe.status, message: universe.message };

  /* The performance snapshots are per exchange, so a sector appears once per
     venue. Averaged rather than picking one: choosing NASDAQ would silently
     describe the whole market by one of its exchanges. */
  const meanBy = (rows, key) => {
    const acc = new Map();
    for (const r of rows) {
      const name = r[key];
      if (!name || !isNum(r.averageChange)) continue;
      const cur = acc.get(name) || { total: 0, n: 0 };
      cur.total += r.averageChange; cur.n += 1;
      acc.set(name, cur);
    }
    return new Map([...acc].map(([k, v]) => [k, v.total / v.n]));
  };
  const sectorChange = meanBy(rowsOf(sectorPerf), 'sector');
  const industryChange = meanBy(rowsOf(industryPerf), 'industry');

  /* The year, by fund. A sector with no tracking fund — or a request the
     vendor refused — leaves the cell empty rather than borrowing a number
     from somewhere it does not belong. */
  const ytdBy = new Map(rowsOf(changes)
    .filter((r) => r && r.symbol && isNum(r.ytd))
    .map((r) => [String(r.symbol).toUpperCase(), Number(r.ytd)]));
  const ytdFor = (sector) => ytdBy.get(String(SECTOR_ETF[sector] || '').toUpperCase()) ?? null;

  /* **One company, one row, and its capitalisation in dollars.**

     `country=US` on the screener returns every listing of a US-domiciled
     company anywhere, and the vendor reports each one's market cap in the
     currency it trades in. So Buenos Aires CEDEARs arrive with pesos in the
     field — `AMD.BA` at 1.36 *quadrillion* — and the same company arrives
     three or four times besides. Summing the raw rows put Semiconductors at a
     quarter of the market and Communication Services at 0.4% of it; with this
     pass they read 11% and 9%, which is the market.

     `dedupe` is the app's own collapse, the one the screens and the calendar
     use, and it prefers the unsuffixed US line — which is both the one company
     and the one price in dollars. */
  const sectors = new Map();
  let total = 0;
  for (const row of dedupe(rowsOf(universe).filter(isUSListing))) {
    const cap = Number(row.marketCap);
    const name = row.sector;
    if (!name || !Number.isFinite(cap) || cap <= 0) continue;
    total += cap;
    const s = sectors.get(name) || { name, cap: 0, count: 0, industries: new Map() };
    s.cap += cap; s.count += 1;
    if (row.industry) {
      const ind = s.industries.get(row.industry) || { name: row.industry, cap: 0, count: 0 };
      ind.cap += cap; ind.count += 1;
      s.industries.set(row.industry, ind);
    }
    sectors.set(name, s);
  }
  if (!total) return { status: 'empty' };

  const list = [...sectors.values()].map((s) => ({
    name: s.name,
    weight: (s.cap / total) * 100,
    change: sectorChange.get(s.name) ?? null,
    ytd: ytdFor(s.name),
    count: s.count,
    industries: [...s.industries.values()]
      .map((i) => ({ name: i.name, weight: (i.cap / s.cap) * 100, change: industryChange.get(i.name) ?? null, count: i.count }))
      .sort((a, b) => b.weight - a.weight),
  })).sort((a, b) => b.weight - a.weight);

  return {
    status: 'ok',
    sectors: list,
    // The market's own day change, weighted by the same caps the tiles are
    // sized by — so the "All sectors" row and the map agree.
    change: list.reduce((a, s) => a + (isNum(s.change) ? s.change * s.weight : 0), 0)
      / (list.filter((s) => isNum(s.change)).reduce((a, s) => a + s.weight, 0) || 1),
    // And the market's own year, from the market's own fund rather than an
    // average of the eleven — the same relationship every other row has.
    ytd: ytdBy.get(MARKET_ETF.toUpperCase()) ?? null,
    fundsStatus: changes.status,
  };
}

/* ==========================================================================
   The block
   ========================================================================== */

/** Tiles for the map: the sectors, or one sector's industries. */
function tilesFor(data, selected) {
  if (selected === ALL) {
    return data.sectors.map((s) => ({ label: s.name, weight: s.weight, change: s.change, sector: s.name }));
  }
  const sector = data.sectors.find((s) => s.name === selected);
  if (!sector) return [];
  /* Below a fraction of a per cent a tile cannot hold a label, so the tail is
     pooled into one rather than drawn as a row of unreadable slivers. */
  const big = sector.industries.filter((i) => i.weight / 100 >= MIN_SHARE).slice(0, MAX_TILES);
  const rest = sector.industries.filter((i) => !big.includes(i));
  const tail = rest.reduce((a, i) => a + i.weight, 0);
  return [
    ...big.map((i) => ({ label: i.name, weight: i.weight, change: i.change, industry: i.name })),
    ...(tail > 0 ? [{ label: `${rest.length} smaller industries`, weight: tail, change: null, rest: true }] : []),
  ];
}

/**
 * The section.
 *
 * Every way out is optional, because the block sits on two pages that want
 * different ones — a title or a button that looks like a link and goes nowhere
 * is worse than one that plainly does not, so each appears only with its
 * callback.
 *
 *   onOpen        makes the heading a link
 *   onAll         a "Sectors & industries" button above the map while it shows
 *                 every sector — the way to the full breakdown. The Sectors
 *                 page leaves it out: that page is where it would lead.
 *   onSectorPage  an "Open <sector>" button above the map once one is chosen.
 *                 The row and tile clicks belong to the drill-down, so leaving
 *                 the page cannot also be those clicks.
 *   onIndustry    what an industry tile opens — its own page
 *   onSector      told when a row is chosen, for a page that follows along
 *
 * `title` renames the heading, for the page where this block *is* the subject
 * and a second heading called Sectors under a page called Sectors reads wrong.
 */
export function sectorsBlock({ onOpen = null, onAll = null, onSector = null, onIndustry = null,
  onSectorPage = null, title = 'Sectors' } = {}) {
  const root = el('section', { class: 'mh-section sb', id: 'market-sectors', 'aria-label': title });
  const body = el('div', { class: 'sb__body' }, [emptyState('loading', '', true)]);

  root.append(
    el('h2', { class: 'mh-heading mh-heading--section' }, [
      el('span', { class: 'mh-section-mark mh-section-mark--sectors', 'aria-hidden': 'true', text: '◳' }),
      onOpen ? el('button', { type: 'button', onclick: onOpen }, [title, arrow()]) : title,
    ]),
    body,
  );

  let data = null;
  let selected = ALL;

  const draw = () => {
    const table = el('div', { class: 'sb-list' }, [
      el('div', { class: 'sb-list__h' }, [
        el('span', { text: 'Sector' }),
        el('span', { text: 'Market weight' }),
        el('span', { title: 'Year to date, from the sector\u2019s tracking ETF', text: 'YTD' }),
      ]),
      row({ name: 'All sectors', weight: 100, change: data.change, ytd: data.ytd }, ALL),
      ...data.sectors.map((s) => row(s, s.name)),
    ]);

    const tiles = tilesFor(data, selected);
    const map = el('div', { class: 'sb-mapwrap' }, [
      el('div', { class: 'sb-map__head' }, [
        el('strong', { text: selected === ALL ? 'All sectors' : selected }),
        el('span', { class: 'sb-map__by', text: 'Sized by market weight, coloured by today' }),
        el('span', { class: 'sb-map__acts' }, [
          selected === ALL && onAll ? el('button', {
            type: 'button', class: 'sb-back', title: 'Every sector and the industries inside it',
            onclick: onAll,
          }, ['Sectors & industries', arrow()]) : null,
          selected === ALL || !onSectorPage ? null : el('button', {
            type: 'button', class: 'sb-back', onclick: () => onSectorPage(selected),
          }, [`Open ${selected}`, arrow()]),
          selected === ALL ? null : el('button', {
            type: 'button', class: 'sb-back', text: '‹ All sectors',
            onclick: () => { selected = ALL; draw(); },
          }),
        ].filter(Boolean)),
      ]),
      treemap(tiles, {
        linksIndustries: !!onIndustry,
        onPick: (t) => {
          if (t.rest) return;
          if (t.sector) { selected = t.sector; draw(); return; }
          if (t.industry) onIndustry?.(t.industry, selected);
        },
      }),
      heatLegend(),
    ]);

    body.replaceChildren(el('div', { class: 'sb-grid' }, [
      el('div', { class: 'sb-panel' }, [
        el('p', { class: 'sb-panel__h', text: 'Select a sector for a visual breakdown' }),
        table,
      ]),
      el('div', { class: 'sb-panel sb-panel--map' }, [map]),
    ]));
  };

  /** One row of the left-hand table. */
  function row(s, key) {
    const on = selected === key;
    return el('button', {
      type: 'button', class: `sb-row${on ? ' is-on' : ''}`, 'aria-pressed': String(on),
      onclick: () => {
        selected = key;
        draw();
        if (key !== ALL) onSector?.(key);
      },
    }, [
      el('span', { class: 'sb-row__n', text: s.name }),
      el('span', { class: 'sb-row__bar', 'aria-hidden': 'true' },
        [el('i', { style: { width: `${Math.max(1, Math.min(100, s.weight))}%` } })]),
      el('span', { class: 'sb-row__w', text: pct(s.weight, { already: true, dp: 2 }) }),
      el('span', { class: `sb-row__c ${isNum(s.ytd) ? (s.ytd >= 0 ? 'is-up' : 'is-down') : ''}`.trim(),
        title: isNum(s.change) ? `Today ${pct(s.change, { already: true, sign: true })}` : null,
        text: isNum(s.ytd) ? pct(s.ytd, { already: true, sign: true }) : 'n/a' }),
    ]);
  }

  loadSectors().then((result) => {
    if (result.status !== 'ok') {
      body.replaceChildren(emptyState(result.status,
        result.message || 'FMP returned no sector breakdown for this market.', true));
      return;
    }
    data = result;
    draw();
  }).catch((error) => {
    body.replaceChildren(emptyState('error', String(error?.message || error), true));
  });

  return root;
}
