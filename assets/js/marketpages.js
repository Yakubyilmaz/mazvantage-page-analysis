/* ==========================================================================
   Maz Vantage — the four asset-class pages under Markets Data

     ?view=markets&sub=indices   the US index board
     ?view=markets&sub=stocks    the US equity market on one screen
     ?view=markets&sub=etfs      the ETF directory
     ?view=markets&sub=economy   rates and the release calendar

   Modelled on the shape of a markets hub rather than copied from one: the
   columns here are the ones this data source can actually fill, and where a
   column a reader might expect is missing, the page says so instead of
   leaving a gap that looks like a bug.

   ---------------------------------------------------------------------------
   These pages are US-only, and that is a decision rather than a limit of the
   vendor
   ---------------------------------------------------------------------------

   FMP carries non-US listings; this app does not use them. `LISTED` sets
   `country: 'US'`, `sector-stats.json` is built from US companies, and every
   grade in the product is a percentile against a **US sector** distribution.
   Mixing foreign listings into these pages would produce ratings measured
   against the wrong peers, so each page states its coverage rather than
   quietly widening it.

   An index quote is the one thing here that needs no distribution behind it,
   which is why a world-indices board would be the cheapest widening if one is
   ever wanted. It is not built.

   ---------------------------------------------------------------------------
   Nothing on these four pages is graded
   ---------------------------------------------------------------------------

   A price, a yield and a fund's size are facts about a market. None of them is
   an assessment, and this product's assessments are all company-level and
   sector-relative. The ETF directory in particular exists *because* ETFs
   cannot be graded here — it lists them and links out, and says as much.
   ========================================================================== */

import { el, isNum, pct, price, num, dec, money, fmtDate, ago, signClass } from './util.js';
import { card, notice, ohead, table, statLine, heatmap, heatLegend, logo } from './ui.js';
import {
  fetchMarket, fetchScreener, fetchFor, fetchCalendar, fetchNewsFeed, fetchBatchQuotes,
  mapLimited, hasApiKey, logoUrl,
} from './fmp.js';
import { sparkline } from './charts.js';
import { sectorSlug } from './nav.js';
import { marketTable, newTableState, FUND_COLUMN_SETS } from './markettable.js';

/* ==========================================================================
   Shared
   ========================================================================== */

export function marketGate(res, what) {
  if (res.status === 'ok') return null;
  if (res.status === 'skipped' || !hasApiKey()) {
    return notice(`<b>${what}</b> is market-wide data and needs a live FMP connection. `
      + 'Add your API key in <code>Settings</code> to load it. The bundled snapshot covers one '
      + 'company only, so there is nothing to fall back to here.');
  }
  if (res.status === 'gated') return notice(`<b>${what}</b> is not included in your current FMP plan.`);
  return notice(`<b>${what}</b> could not be loaded — ${res.message || 'unknown error'}.`, 'notice--error');
}

/* ==========================================================================
   1. The US index catalog
   --------------------------------------------------------------------------
   What used to be the Indices page. `?view=markets&sub=indices` is now the
   Market Indices board in `marketindices.js`, which reads the vendor's whole
   index feed and groups it by region; this list stays because the Market
   Overview strip names its six tiles from it.
   ========================================================================== */

const US_INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', note: 'Large-cap benchmark' },
  { symbol: '^DJI', name: 'Dow Jones Industrial Average', note: '30 industrials, price-weighted' },
  { symbol: '^IXIC', name: 'Nasdaq Composite', note: 'Everything on Nasdaq' },
  { symbol: '^NDX', name: 'Nasdaq 100', note: 'Largest non-financials on Nasdaq' },
  { symbol: '^RUT', name: 'Russell 2000', note: 'Small caps' },
  { symbol: '^MID', name: 'S&P MidCap 400', note: 'Mid caps' },
  { symbol: '^SML', name: 'S&P SmallCap 600', note: 'Small caps, profitability screened' },
  { symbol: '^OEX', name: 'S&P 100', note: 'The largest hundred' },
  { symbol: '^NYA', name: 'NYSE Composite', note: 'Everything on the NYSE' },
  { symbol: '^DJT', name: 'Dow Jones Transportation', note: 'Freight and airlines' },
  { symbol: '^DJU', name: 'Dow Jones Utilities', note: 'Regulated utilities' },
  { symbol: '^VIX', name: 'CBOE Volatility Index', note: 'Implied volatility on the S&P 500' },
];

/* ==========================================================================
   2. Stocks — the equity market on one screen
   ========================================================================== */

export async function stocksSection(nav) {
  const [sect, gain, lose, act, big] = await Promise.all([
    fetchMarket('sectorPerf'),
    fetchMarket('gainers'),
    fetchMarket('losers'),
    fetchMarket('active'),
    hasApiKey()
      ? fetchScreener({ isEtf: false, isFund: false, isActivelyTrading: true, country: 'US',
        marketCapMoreThan: 5e10, limit: 200 })
      : Promise.resolve({ status: 'skipped' }),
  ]);

  const rows = sectorsToHeat(sect);
  const up = rows.filter((r) => r.change > 0).length;

  const largest = (big.status === 'ok' ? big.data : [])
    .filter((r) => r.symbol && !r.isEtf && !r.isFund)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, 20);

  return [
    card('mk-st-breadth', [
      ohead('US equities today',
        sect.date ? el('span', { class: 'pill pill--muted', text: fmtDate(sect.date) }) : null,
        'Average change across the constituents of each sector, members counted equally. Not a '
        + 'capitalisation-weighted index — a sector can read positive while its largest company '
        + 'falls.'),
      marketGate(sect, 'Sector performance') || (rows.length ? el('div', {}, [
        el('div', { class: 'ostats ostats--split' }, [
          statLine('Sectors higher', `${up} of ${rows.length}`),
          statLine('Best', rows[0] ? `${rows[0].label} ${pct(rows[0].change, { already: true, sign: true })}` : 'n/a'),
          statLine('Worst', rows.at(-1) ? `${rows.at(-1).label} ${pct(rows.at(-1).change, { already: true, sign: true })}` : 'n/a'),
        ]),
        el('div', { class: 'mt2' }, [
          heatmap(rows, { onPick: (r) => nav.goView?.('sectors', sectorSlug(r.label)) }),
          heatLegend(),
        ]),
      ]) : notice('No sector performance was returned for the last five sessions.')),
    ], 'ocard ovw__c12'),

    miniList('Gainers', gain, 'gainers', nav),
    miniList('Losers', lose, 'losers', nav),
    miniList('Most active', act, 'active', nav),

    card('mk-st-largest', [
      ohead('Largest by market capitalisation', null,
        'The twenty biggest US companies the screener returns above $50b. Size only — nothing '
        + 'in this table is a ranking of quality.'),
      marketGate(big, 'The company screener') || (largest.length
        ? table(
            [{ label: 'Ticker' }, { label: 'Company' }, { label: 'Sector' },
              { label: 'Market cap', num: true }, { label: 'Price', num: true }],
            largest.map((r) => [
              el('button', {
                type: 'button', class: 'mkticker', text: r.symbol,
                title: `Open the ${r.companyName || r.symbol} report`,
                onclick: () => nav.goSymbol?.(r.symbol),
              }),
              r.companyName || '—',
              r.sector || '—',
              isNum(r.marketCap) ? money(r.marketCap) : 'n/a',
              isNum(r.price) ? price(r.price) : 'n/a',
            ]))
        : notice('The screener returned nothing above the size floor.')),

      el('div', { class: 'mt2' }, [
        el('button', {
          type: 'button', class: 'btn btn--primary', text: 'Every listed company →',
          onclick: () => nav.goView?.('stocks', 'all'),
        }),
        el('button', {
          type: 'button', class: 'btn', text: 'Screen them →',
          onclick: () => nav.goView?.('ideas', 'all'),
        }),
      ]),

      el('p', { class: 't-tiny subtle mt2', text: 'A 52-week high and low list is the one thing a '
        + 'markets page usually carries that is missing here: the vendor publishes no such feed, '
        + 'and deriving it would mean a year of prices for every company on the exchange. The '
        + 'index board does show the 52-week position for each index, where it costs one quote.' }),
    ], 'ocard ovw__c12'),
  ];
}

/** Sector rows, shaped for the heatmap and averaged across exchanges. */
function sectorsToHeat(res) {
  if (res.status !== 'ok') return [];
  const by = new Map();
  for (const r of res.data || []) {
    const name = r.sector || r.industry;
    if (!name || !isNum(r.averageChange)) continue;
    const cur = by.get(name) || { label: name, total: 0, n: 0 };
    cur.total += r.averageChange;
    cur.n += 1;
    by.set(name, cur);
  }
  return [...by.values()]
    .map((x) => ({ label: x.label, change: x.total / x.n }))
    .sort((a, b) => b.change - a.change);
}

function miniList(title, res, sub, nav) {
  const rows = (res.status === 'ok' ? res.data : []).slice(0, 6);
  return card(`mk-st-${sub}`, [
    ohead(title),
    marketGate(res, title) || (rows.length
      ? el('div', { class: 'mklist' }, rows.map((r) => el('div', { class: 'mkrow' }, [
          logo(logoUrl(r.symbol), r.symbol, { size: 'sm' }),
          el('div', { class: 'mkrow__b' }, [
            el('button', {
              type: 'button', class: 'mkrow__s', text: r.symbol,
              onclick: () => nav.goSymbol?.(r.symbol),
            }),
            el('span', { class: 'mkrow__n', title: r.name, text: r.name || '' }),
          ]),
          el('span', { class: `mkrow__v ${signClass(r.changesPercentage)}`.trim(),
            text: isNum(r.changesPercentage) ? pct(r.changesPercentage, { already: true, sign: true }) : 'n/a' }),
        ])))
      : notice('Nothing returned.')),
    el('button', {
      type: 'button', class: 'omore', text: `All ${title.toLowerCase()}`,
      onclick: () => nav.goView?.('markets', sub),
    }),
  ], 'ocard ovw__c4');
}

/* ==========================================================================
   3. ETFs
   ========================================================================== */

/**
 * The ETF directory.
 *
 * One `company-screener` call with `isEtf` inverted — the same proven path the
 * stock directory uses, asked the opposite question. That is the whole reason
 * this page is cheap enough to load on arrival.
 *
 * **Nothing here is graded, and it cannot be.** Every score in this product is
 * a percentile of a company's ratios against its sector; a fund has neither
 * ratios nor a sector distribution. Listing funds is a directory problem and
 * this page solves that one only.
 */
export function etfsSection(nav) {
  const host = el('div', { class: 'ovw' });

  if (!hasApiKey()) {
    host.append(card('mk-etf-key', [
      ohead('ETFs'),
      el('p', { class: 'fgroup__desc', text: 'Every exchange-traded fund the vendor lists, with '
        + 'its last price and size. A directory — funds are not graded anywhere in this product.' }),
      marketGate({ status: 'skipped' }, 'The fund list'),
    ], 'ocard ovw__c12'));
    return host;
  }

  host.append(card('mk-etf-loading', [
    el('div', { class: 'sk sk--line', style: { width: '200px', height: '22px' } }),
    el('div', { class: 'sk sk--block', style: { marginTop: '16px' } }),
  ], 'ocard ovw__c12'));

  const state = { q: '', table: newTableState(FUND_COLUMN_SETS) };

  fetchScreener({ isEtf: true, isActivelyTrading: true, country: 'US', limit: 5000 })
    .then((res) => {
      if (res.status !== 'ok') {
        host.replaceChildren(card('mk-etf-err', [ohead('ETFs'), marketGate(res, 'The fund list')], 'ocard ovw__c12'));
        return;
      }
      const funds = (res.data || []).filter((r) => r.symbol);
      const draw = () => host.replaceChildren(etfCard(funds, state, draw, nav));
      draw();
    })
    .catch((err) => host.replaceChildren(card('mk-etf-err', [
      ohead('ETFs'),
      notice(`The fund list could not be loaded — ${String(err.message)}.`, 'notice--error'),
    ], 'ocard ovw__c12')));

  return host;
}

function etfCard(funds, state, redraw, nav) {
  const q = state.q.trim().toLowerCase();
  const rows = funds.filter((f) => !q
    || (f.symbol || '').toLowerCase().includes(q)
    || (f.companyName || '').toLowerCase().includes(q));

  const search = el('input', {
    type: 'search', class: 'pfsearch__i', id: 'etf-q', value: state.q,
    placeholder: 'Symbol or fund name…', autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'Search funds',
  });
  search.addEventListener('input', () => {
    state.q = search.value; state.table.page = 1; redraw();
    const next = document.getElementById('etf-q');
    if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
  });

  return card('mk-etf-dir', [
    el('div', { class: 'pfhead' }, [
      el('div', {}, [
        el('h2', { class: 'pfhead__t', text: 'ETFs' }),
        el('p', { class: 'pfhead__b', text: 'Every US-listed exchange-traded fund the vendor '
          + 'returns. A directory, not a screen — see the note under the table for why funds '
          + 'carry no rating anywhere in this product.' }),
      ]),
      el('div', { class: 'pfsearch' }, [search]),
    ]),

    el('div', { class: 'asbar' }, [
      el('p', { class: 'rfbar__n' }, [
        el('b', { text: num(rows.length, 0) }), ` fund${rows.length === 1 ? '' : 's'}`,
        q ? ` of ${num(funds.length, 0)}` : '',
      ]),
    ]),

    marketTable({
      rows,
      sets: FUND_COLUMN_SETS,
      state: state.table,
      // Plain text, not a link: there is no company report behind a fund.
      identity: (f) => el('div', { class: 'mtid' }, [
        el('span', { class: 'mtid__s mtid__s--plain', text: f.symbol }),
        el('span', { class: 'mtid__n', title: f.companyName, text: f.companyName || '' }),
      ]),
      emptyText: 'No fund matches that.',
    }),

    notice('Funds are <b>not rated</b> here, and the gap is structural rather than a to-do. Every '
      + 'score in this product is a percentile of a company’s ratios against its own sector — a '
      + 'fund has no ratios of its own and belongs to no sector distribution. The ticker column is '
      + 'plain text for the same reason: there is no company report behind a fund to open. '
      + '<b>Size</b> is the vendor’s market-capitalisation field, which for a fund approximates '
      + 'assets under management rather than reporting it.'),
  ], 'ocard ovw__c12');
}

/* ==========================================================================
   4. Economy
   ========================================================================== */

/** The curve, in the order it is read. */
const TENORS = [
  ['month1', '1M'], ['month2', '2M'], ['month3', '3M'], ['month6', '6M'],
  ['year1', '1Y'], ['year2', '2Y'], ['year3', '3Y'], ['year5', '5Y'],
  ['year7', '7Y'], ['year10', '10Y'], ['year20', '20Y'], ['year30', '30Y'],
];

export async function economySection(nav) {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const [rates, cal] = await Promise.all([
    fetchMarket('treasuryRates', {
      from: iso(new Date(today.getTime() - 40 * 864e5)), to: iso(today),
    }),
    fetchMarket('econCalendar', {
      from: iso(new Date(today.getTime() - 7 * 864e5)),
      to: iso(new Date(today.getTime() + 14 * 864e5)),
    }),
  ]);

  return [curveCard(rates), calendarCard(cal)];
}

function curveCard(res) {
  const rows = (res.status === 'ok' ? res.data : [])
    .filter((r) => r && r.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const latest = rows[0] || null;
  const weekAgo = rows.find((r) => new Date(latest?.date) - new Date(r.date) >= 6 * 864e5) || null;
  const monthAgo = rows.at(-1) || null;

  const spread = latest && isNum(latest.year10) && isNum(latest.year2)
    ? latest.year10 - latest.year2 : null;

  return card('mk-ec-curve', [
    ohead('US Treasury yields',
      latest ? el('span', { class: 'pill pill--muted', text: fmtDate(latest.date) }) : null,
      'The constant-maturity curve as the vendor publishes it. Yields are per cent, and the '
      + 'change columns are in basis points against the same curve a week and a month earlier.'),

    marketGate(res, 'Treasury rates') || (latest ? el('div', {}, [
      el('div', { class: 'ostats ostats--split' }, [
        statLine('10-year', `${num(latest.year10, 2)}%`),
        statLine('2-year', `${num(latest.year2, 2)}%`),
        statLine('10y minus 2y', isNum(spread) ? `${spread >= 0 ? '+' : ''}${num(spread, 2)}%` : 'n/a', {
          tone: isNum(spread) ? (spread < 0 ? 'neg' : '') : '',
          note: isNum(spread) ? (spread < 0 ? 'inverted' : 'positive slope') : '',
        }),
        statLine('3-month', `${num(latest.month3, 2)}%`),
      ]),

      el('div', { class: 'mt2' }, [table(
        [{ label: 'Tenor' }, { label: 'Yield', num: true },
          { label: '1 week', num: true }, { label: '1 month', num: true }],
        TENORS.map(([k, label]) => {
          const now = latest[k];
          const bp = (prev) => (isNum(now) && isNum(prev?.[k])
            ? el('span', { class: signClass(now - prev[k]),
              text: `${now - prev[k] >= 0 ? '+' : ''}${Math.round((now - prev[k]) * 100)}bp` })
            : 'n/a');
          return [label, isNum(now) ? `${num(now, 2)}%` : 'n/a', bp(weekAgo), bp(monthAgo)];
        }))]),

      el('p', { class: 't-tiny subtle mt2', text: 'An inverted curve — the ten-year below the '
        + 'two-year — is reported here as arithmetic, not as a signal. This product holds no '
        + 'macro view and nothing on any other page is computed from these rates. The cost of '
        + 'capital used in the report’s valuation models is estimated per company, not read off '
        + 'this curve.' }),
    ]) : notice('No treasury data was returned for the last forty days.')),
  ], 'ocard ovw__c8');
}

function calendarCard(res) {
  const all = (res.status === 'ok' ? res.data : []).filter((r) => r && r.date);
  const us = all.filter((r) => !r.country || r.country === 'US');
  const rows = us
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 24);

  return card('mk-ec-cal', [
    ohead('Release calendar', null,
      'US economic releases for the week behind and the fortnight ahead, as the vendor '
      + 'schedules them. Estimates and prior readings are the vendor’s.'),
    marketGate(res, 'The economic calendar') || (rows.length
      ? el('div', { class: 'eclist' }, rows.map((r) => el('div', { class: 'ecrow' }, [
          el('div', { class: 'ecrow__d' }, [
            el('b', { text: fmtDate(r.date, { day: 'numeric', month: 'short' }) }),
            r.impact ? el('i', { class: `ecrow__i is-${String(r.impact).toLowerCase()}`, text: r.impact }) : null,
          ]),
          el('div', { class: 'ecrow__b' }, [
            el('span', { class: 'ecrow__e', text: r.event || '—' }),
            el('span', { class: 'ecrow__v' }, [
              isNum(r.actual) ? el('b', { text: `actual ${num(r.actual, 2)}` }) : null,
              isNum(r.estimate) ? el('span', { text: `est ${num(r.estimate, 2)}` }) : null,
              isNum(r.previous) ? el('span', { text: `prev ${num(r.previous, 2)}` }) : null,
            ]),
          ]),
        ])))
      : notice('No US releases were returned for this window.')),
    el('p', { class: 't-tiny subtle mt2', text: 'Filtered to US releases, because the rest of '
      + 'this product is a US universe. The vendor returns other countries and they are dropped '
      + 'here rather than mixed in.' }),
  ], 'ocard ovw__c4');
}

/* ==========================================================================
   5. The hub links, for the overview
   ========================================================================== */

/**
 * The section grid at the foot of Market Overview.
 *
 * A markets hub is mostly a table of contents, and this is it — one tile per
 * destination, so the overview answers "what else is here" as well as "what
 * happened today".
 */
export function hubCard(nav) {
  const items = [
    ['Indices', 'indices', 'Twelve US indices, the session and the twelve-month position.'],
    ['Stocks', 'stocks', 'The equity market on one screen: breadth, a sector heatmap, movers.'],
    ['ETFs', 'etfs', 'Every US-listed fund the vendor returns, searchable.'],
    ['Economy', 'economy', 'The Treasury curve and the US release calendar.'],
    ['Gainers', 'gainers', 'The session’s biggest risers, filtered to common stock.'],
    ['Losers', 'losers', 'The session’s biggest fallers.'],
    ['Most Active', 'active', 'Where the volume went.'],
    ['Sectors', 'sectors', 'Every sector’s session move and aggregate multiple.'],
    ['Industries', 'industries', 'The same, one level down.'],
  ];

  return card('mk-hub', [
    ohead('Everything under Markets Data'),
    el('div', { class: 'hubgrid' }, items.map(([label, sub, blurb]) => el('button', {
      type: 'button', class: 'hubtile',
      onclick: () => nav.goView?.('markets', sub),
    }, [
      el('b', { text: label }),
      el('span', { text: blurb }),
    ]))),
  ], 'ocard ovw__c12');
}

/* ==========================================================================
   6. The Market Overview hub

   One section per dataset, each with its own content and its own way through
   to the page behind it. The shape a markets hub has: a row of tiles you can
   read at a glance, then the lists and the calendar, then the news.

   ---------------------------------------------------------------------------
   What this page costs, and why it loads anyway
   ---------------------------------------------------------------------------

   Roughly eighteen requests on arrival. That is a lot by this app's standards,
   where a screen waits for a click before spending anything — but a hub whose
   sections are all empty until you press something is not a hub, it is a menu
   with extra steps. The rule the rest of the product follows is *the expensive
   thing waits*; here the expensive thing IS the page.

   The sparklines are the dear half: four index price histories, one request
   each. They are capped at four for that reason rather than run across all
   twelve, and the Indices page has the full board.

   ---------------------------------------------------------------------------
   What is not here, and is not coming from this data source
   ---------------------------------------------------------------------------

   A markets hub elsewhere carries crypto, futures, forex and corporate bonds.
   This product is a US equity research tool: the grading engine, the screens,
   the Shariah model and the research feed are all company-level. Those asset
   classes have no home here, and a tile row of them would be four sections
   that lead nowhere. Treasuries appear because the Economy page reads the
   curve; nothing else does.
   ========================================================================== */

/**
 * The six on the tile row. Each costs a quote and a price history.
 *
 * All six carry a sparkline rather than the first four: a row where two tiles
 * are shorter than the rest reads as two that failed to load, and the two
 * saved requests are not worth that.
 */
const STRIP_INDICES = ['^GSPC', '^IXIC', '^DJI', '^RUT', '^NDX', '^VIX'];

const INDEX_NAME = Object.fromEntries(US_INDICES.map((i) => [i.symbol, i.name]));

/**
 * A section heading with the way through to its own page.
 *
 * Every section on this hub has one. A section that shows six of something and
 * does not say where the rest are is the most annoying shape a summary can
 * take.
 *
 * `linkText` carries **no arrow**: `.omore` prints one itself, and a label
 * that includes another renders "All ETFs -> ->".
 */
function sectionHead(title, linkText, onClick, info) {
  return ohead(title, el('button', {
    type: 'button', class: 'omore', text: linkText, onclick: onClick,
  }), info);
}

/**
 * One quote as a tile: logo, name, level, change, and optionally a shape.
 *
 * `symbol` names the row and, when `withLogo`, fetches its logo. Indices pass
 * `withLogo: false`: an index is not a company, the image host has nothing for
 * it, and `logo()` draws the letter fallback instead — which keeps the row's
 * rhythm without six requests that can only fail.
 */
function quoteTile(label, q, spark, onClick, symbol = null, withLogo = true) {
  const chg = q?.changePercentage;
  const kids = [
    el('div', { class: 'qtile__h' }, [
      logo(withLogo && symbol ? logoUrl(symbol) : null, symbol || label, { size: 'sm' }),
      el('div', { class: 'qtile__id' }, [
        el('span', { class: 'qtile__k', title: label, text: label }),
        symbol ? el('i', { class: 'qtile__s', text: symbol }) : null,
      ]),
    ]),
    el('span', { class: 'qtile__v', text: isNum(q?.price) ? dec(q.price, 2) : 'n/a' }),
    el('span', { class: `qtile__c ${signClass(chg)}`.trim(),
      text: isNum(chg) ? pct(chg, { already: true, sign: true }) : 'n/a' }),
    spark || null,
  ];
  return onClick
    ? el('button', { type: 'button', class: 'qtile', onclick: onClick }, kids)
    : el('div', { class: 'qtile' }, kids);
}

/**
 * A strip of six tiles for a list of symbols: one batch quote, six histories.
 *
 * Shared by the index, equity and fund sections, which is why one treatment
 * serves three rather than being written three times. The batch quote is what
 * makes it affordable: six tiles cost one quote request, not six.
 */
async function tileStrip(symbols, labelFor, onPick, { withLogo = true } = {}) {
  const from = new Date(Date.now() - 95 * 864e5).toISOString().slice(0, 10);
  const [quotes, histories] = await Promise.all([
    fetchBatchQuotes(symbols),
    mapLimited(symbols, (sym) => fetchFor('prices', sym, { from }), 4),
  ]);

  const bySymbol = Object.fromEntries(
    (quotes.status === 'ok' ? quotes.data : []).map((q) => [q.symbol, q]));

  return el('div', { class: 'qtiles' }, symbols.map((sym, i) => {
    const h = histories[i]?.status === 'ok' ? histories[i].data : null;
    const pts = (Array.isArray(h) ? h : [])
      .map((x) => ({ date: x.date, value: x.price ?? x.close ?? null }))
      .filter((x) => isNum(x.value))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return quoteTile(
      labelFor(sym, bySymbol[sym]),
      bySymbol[sym],
      pts.length > 2 ? sparkline(pts, { width: 170, height: 36 }) : null,
      onPick ? () => onPick(sym) : null,
      sym,
      withLogo,
    );
  }));
}

/* ---------- the sections ---------------------------------------------------- */

async function indicesStrip(nav) {
  if (!hasApiKey()) {
    return card('ov-idx', [
      sectionHead('Indices', 'All indices', () => nav.goView?.('markets', 'indices')),
      marketGate({ status: 'skipped' }, 'Index quotes'),
    ], 'ocard ovw__c12');
  }

  return card('ov-idx', [
    sectionHead('Indices', 'All indices', () => nav.goView?.('markets', 'indices'),
      'Level and session change for six US indices, each with three months of closes as a '
      + 'shape. The line carries no scale on purpose — the two figures above it already say '
      + 'the level and the move.'),
    // `withLogo: false` — an index is not a company. Asking the image host for
    // six logos it does not have is six requests that can only 404, and the
    // letter fallback renders immediately instead.
    await tileStrip(STRIP_INDICES, (sym) => INDEX_NAME[sym] || sym,
      () => nav.goView?.('markets', 'indices'), { withLogo: false }),
  ], 'ocard ovw__c12');
}

/* The six the market watches. Fixed rather than "the six largest the screener
   returns": a strip that reorders itself between sessions is one a reader
   cannot learn, and the equity page carries the full ranking. */
const MEGACAPS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

async function stocksTiles(nav) {
  if (!hasApiKey()) return null;
  return tileStrip(MEGACAPS, (sym, q) => q?.name || sym, (sym) => nav.goSymbol?.(sym));
}

function stocksStrip(sect, tiles, nav) {
  const rows = sectorsToHeat(sect);
  const up = rows.filter((r) => r.change > 0).length;

  return card('ov-stocks', [
    sectionHead('US stocks', 'The equity market', () => nav.goView?.('markets', 'stocks'),
      'Six megacaps with three months of closes, then the session across every sector — '
      + 'average change among each sector’s constituents, members counted equally, which is not '
      + 'a capitalisation-weighted index.'),
    tiles || null,
    tiles ? el('div', { class: 'ovrule' }) : null,
    marketGate(sect, 'Sector performance') || (rows.length ? el('div', {}, [
      el('div', { class: 'ostats ostats--split' }, [
        statLine('Sectors higher', `${up} of ${rows.length}`),
        statLine('Best', rows[0] ? `${rows[0].label} ${pct(rows[0].change, { already: true, sign: true })}` : 'n/a'),
        statLine('Worst', rows.at(-1) ? `${rows.at(-1).label} ${pct(rows.at(-1).change, { already: true, sign: true })}` : 'n/a'),
      ]),
      el('div', { class: 'mt2' }, [
        heatmap(rows, { onPick: (r) => nav.goView?.('sectors', sectorSlug(r.label)) }),
        heatLegend(),
      ]),
    ]) : notice('No sector performance was returned for the last five sessions.')),
  ], 'ocard ovw__c12');
}

async function etfStrip(nav) {
  if (!hasApiKey()) {
    return card('ov-etf', [
      sectionHead('ETFs', 'All ETFs', () => nav.goView?.('markets', 'etfs')),
      marketGate({ status: 'skipped' }, 'The fund list'),
    ], 'ocard ovw__c6');
  }

  const res = await fetchScreener({ isEtf: true, isActivelyTrading: true, country: 'US', limit: 5000 });
  const funds = (res.status === 'ok' ? res.data : [])
    .filter((f) => f.symbol && isNum(f.marketCap))
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 6);

  const names = Object.fromEntries(funds.map((f) => [f.symbol, f.companyName || f.symbol]));
  // No `onPick`: there is no company report behind a fund to open.
  const tiles = funds.length
    ? await tileStrip(funds.map((f) => f.symbol), (sym) => names[sym] || sym, null)
    : null;

  return card('ov-etf', [
    sectionHead('ETFs', 'All ETFs', () => nav.goView?.('markets', 'etfs'),
      'The six largest US-listed funds the vendor returns, by the size field it reports. Funds '
      + 'are not graded anywhere in this product — the directory says why.'),
    marketGate(res, 'The fund list') || (tiles || notice('No funds were returned.')),
  ], 'ocard ovw__c12');
}

function economyStrip(rates, cal, nav) {
  const rows = (rates.status === 'ok' ? rates.data : [])
    .filter((r) => r && r.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = rows[0] || null;
  const spread = latest && isNum(latest.year10) && isNum(latest.year2)
    ? latest.year10 - latest.year2 : null;

  const soon = (cal.status === 'ok' ? cal.data : [])
    .filter((r) => r && r.date && (!r.country || r.country === 'US'))
    .filter((r) => new Date(r.date) >= new Date(Date.now() - 864e5))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  return card('ov-econ', [
    sectionHead('Economy', 'Rates and releases', () => nav.goView?.('markets', 'economy'),
      'The Treasury curve at four points, and the next US releases. Nothing else in this '
      + 'product is computed from these — the cost of capital in the valuation models is '
      + 'estimated per company, not read off this curve.'),

    marketGate(rates, 'Treasury rates') || (latest ? el('div', { class: 'ostats ostats--split' }, [
      statLine('3-month', isNum(latest.month3) ? `${dec(latest.month3, 2)}%` : 'n/a'),
      statLine('2-year', isNum(latest.year2) ? `${dec(latest.year2, 2)}%` : 'n/a'),
      statLine('10-year', isNum(latest.year10) ? `${dec(latest.year10, 2)}%` : 'n/a'),
      statLine('10y minus 2y', isNum(spread) ? `${spread >= 0 ? '+' : ''}${dec(spread, 2)}%` : 'n/a', {
        tone: isNum(spread) && spread < 0 ? 'neg' : '',
        note: isNum(spread) ? (spread < 0 ? 'inverted' : 'positive slope') : '',
      }),
    ]) : notice('No treasury data was returned.')),

    soon.length ? el('div', { class: 'mt2' }, [
      el('p', { class: 'osub', text: 'Next releases' }),
      el('div', { class: 'ovlist' }, soon.map((r) => el('div', { class: 'ovrow' }, [
        el('div', { class: 'ovrow__b' }, [
          el('b', { text: fmtDate(r.date, { day: 'numeric', month: 'short' }) }),
          el('span', { title: r.event, text: r.event || '' }),
        ]),
        el('span', { class: 'ovrow__v subtle',
          text: isNum(r.estimate) ? `est ${dec(r.estimate, 2)}` : '' }),
      ]))),
    ]) : null,
  ], 'ocard ovw__c6');
}

async function earningsStrip(nav) {
  if (!hasApiKey()) {
    return card('ov-earn', [
      sectionHead('Earnings this week', 'Full calendar', () => nav.goView?.('calendar')),
      marketGate({ status: 'skipped' }, 'The earnings calendar'),
    ], 'ocard ovw__c6');
  }

  const iso = (d) => d.toISOString().slice(0, 10);
  const res = await fetchCalendar('earnings', iso(new Date()), iso(new Date(Date.now() + 7 * 864e5)));

  const rows = (res.status === 'ok' ? res.data : [])
    .filter((r) => r.symbol && isNum(r.epsEstimated))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 8);

  return card('ov-earn', [
    sectionHead('Earnings this week', 'Full calendar', () => nav.goView?.('calendar'),
      'Companies reporting in the next seven days that carry an EPS estimate. The calendar '
      + 'itself collapses cross-listings and carries dividends and splits too.'),
    marketGate(res, 'The earnings calendar') || (rows.length
      ? el('div', { class: 'ovlist' }, rows.map((r) => el('div', { class: 'ovrow' }, [
          el('div', { class: 'ovrow__b' }, [
            logo(logoUrl(r.symbol), r.symbol, { size: 'sm' }),
            el('button', {
              type: 'button', class: 'mkticker', text: r.symbol,
              title: `Open the ${r.symbol} report`,
              onclick: () => nav.goSymbol?.(r.symbol),
            }),
            el('span', { text: fmtDate(r.date, { day: 'numeric', month: 'short' }) }),
          ]),
          el('span', { class: 'ovrow__v subtle', text: `est ${dec(r.epsEstimated, 2)}` }),
        ])))
      : notice('Nothing with an estimate reports in the next seven days.')),
  ], 'ocard ovw__c6');
}

/* ==========================================================================
   Highest volume, and the day's widest swings
   ========================================================================== */

/**
 * The two sections under the mover lists.
 *
 * One screener call and one batch quote between them, which is the only reason
 * they are affordable:
 *
 *   Highest volume   the screener's own volume field, over the whole universe
 *   Most volatile    the session's high-to-low range as a share of the
 *                    previous close, over the hundred most-traded companies
 *
 * The second is a real intraday range rather than a proxy, and it asks a
 * different question from the gainers and losers above it: a company can swing
 * several per cent across a session and close where it opened, and only this
 * section will show it.
 *
 * It ranks the hundred most traded rather than the whole market, because a
 * quote per company across five thousand listings is not a page load. The card
 * says so - "of the hundred most traded" is part of the claim, not a footnote.
 */
const VOL_POOL = 100;

async function volumeAndVolatility(nav) {
  if (!hasApiKey()) {
    return [
      card('ov-volume', [
        sectionHead('Highest volume', 'Most active', () => nav.goView?.('markets', 'active')),
        marketGate({ status: 'skipped' }, 'The company screener'),
      ], 'ocard ovw__c6'),
      card('ov-swing', [
        sectionHead('Most volatile', 'All stocks', () => nav.goView?.('stocks', 'all')),
        marketGate({ status: 'skipped' }, 'Session quotes'),
      ], 'ocard ovw__c6'),
    ];
  }

  const res = await fetchScreener({
    isEtf: false, isFund: false, isActivelyTrading: true, country: 'US',
    marketCapMoreThan: 1e9, limit: 5000,
  });

  const byVolume = (res.status === 'ok' ? res.data : [])
    .filter((r) => r.symbol && !r.isEtf && !r.isFund && isNum(r.volume))
    .sort((a, b) => b.volume - a.volume);

  // One pool, two answers: the hundred most traded are also the candidates
  // whose intraday range is worth ranking.
  const quotes = byVolume.length
    ? await fetchBatchQuotes(byVolume.slice(0, VOL_POOL).map((r) => r.symbol))
    : { status: 'ok', data: [] };

  const swings = (quotes.status === 'ok' ? quotes.data : [])
    .map((q) => {
      const base = isNum(q.previousClose) && q.previousClose > 0 ? q.previousClose : q.price;
      const range = isNum(q.dayHigh) && isNum(q.dayLow) && isNum(base) && base > 0
        ? (q.dayHigh - q.dayLow) / base : null;
      return { ...q, range };
    })
    .filter((q) => isNum(q.range) && q.range > 0)
    .sort((a, b) => b.range - a.range)
    .slice(0, 6);

  const row = (sym, name, right) => el('div', { class: 'ovrow' }, [
    el('div', { class: 'ovrow__b' }, [
      logo(logoUrl(sym), sym, { size: 'sm' }),
      el('button', {
        type: 'button', class: 'mkticker', text: sym,
        title: `Open the ${name || sym} report`,
        onclick: () => nav.goSymbol?.(sym),
      }),
      el('span', { title: name, text: name || '' }),
    ]),
    el('span', { class: 'ovrow__v', text: right }),
  ]);

  return [
    card('ov-volume', [
      sectionHead('Highest volume', 'Most active', () => nav.goView?.('markets', 'active'),
        'Shares traded this session, across every US company over $1b the screener returns. '
        + 'The vendor publishes its own "most active" list and this is not it: that one is a '
        + 'short unfiltered feed, this is the whole universe ranked on the volume field, and '
        + 'the two differ at the edges.'),
      marketGate(res, 'The company screener') || (byVolume.length
        ? el('div', { class: 'ovlist' },
          byVolume.slice(0, 6).map((r) => row(r.symbol, r.companyName, num(r.volume, 0))))
        : notice('No companies were returned.')),
    ], 'ocard ovw__c6'),

    card('ov-swing', [
      sectionHead('Most volatile', 'All stocks', () => nav.goView?.('stocks', 'all'),
        'The session high-to-low range as a share of the previous close, among the hundred '
        + 'most-traded companies. A different question from the gainers and losers above: a '
        + 'company can swing several per cent across a session and close where it opened.'),
      marketGate(quotes, 'Session quotes') || (swings.length
        ? el('div', { class: 'ovlist' }, swings.map((q) => row(q.symbol, q.name, pct(q.range))))
        : notice('No intraday ranges could be computed for this session.')),
      el('p', { class: 't-tiny subtle mt2', text: 'Ranked over the hundred most traded rather '
        + 'than the whole market: a quote per company across five thousand listings is not a '
        + 'page load. A thinly traded company with a wider swing will not appear here.' }),
    ], 'ocard ovw__c6'),
  ];
}

async function newsStrip(nav) {
  if (!hasApiKey()) {
    return card('ov-news', [
      sectionHead('Latest market news', 'All news', () => nav.goView?.('news', 'latest')),
      marketGate({ status: 'skipped' }, 'Market news'),
    ], 'ocard ovw__c12');
  }

  const res = await fetchNewsFeed('general', { limit: 12 });
  const stories = (res.status === 'ok' ? res.data : [])
    .filter((n) => n && n.title)
    .slice(0, 8);

  return card('ov-news', [
    sectionHead('Latest market news', 'All news', () => nav.goView?.('news', 'latest'),
      'The general market feed, newest first, unfiltered. Nothing here is scored, ranked or '
      + 'sentiment-tagged.'),
    marketGate(res, 'Market news') || (stories.length
      ? el('div', { class: 'secnews' }, stories.map((n) => el('article', { class: 'secnews__i' }, [
          el('div', { class: 'secnews__m' }, [
            el('span', { class: 'secnews__o', text: n.site || n.publisher || 'Unknown outlet' }),
            el('span', { class: 'acard__dot', text: '·' }),
            el('time', { datetime: n.publishedDate || '', text: ago(n.publishedDate) }),
          ]),
          n.url
            ? el('a', { class: 'secnews__t', href: n.url, target: '_blank', rel: 'noopener noreferrer',
                text: n.title })
            : el('span', { class: 'secnews__t', text: n.title }),
        ])))
      : notice('No stories were returned.')),
  ], 'ocard ovw__c12');
}

/**
 * The whole hub, in order.
 *
 * Exported as one array builder rather than as six functions, because the
 * order *is* the design — indices, then equities, then the mover lists that
 * used to be this page's whole content, then funds, rates, earnings and news.
 * `markets.js` renders what this returns and owns nothing else about it.
 */
export async function overviewSections(nav) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const [idx, sect, gain, lose, act, etf, rates, cal, earn, news, tiles, volPair]
    = await Promise.all([
    indicesStrip(nav),
    fetchMarket('sectorPerf'),
    fetchMarket('gainers'),
    fetchMarket('losers'),
    fetchMarket('active'),
    etfStrip(nav),
    fetchMarket('treasuryRates', {
      from: iso(new Date(Date.now() - 10 * 864e5)), to: iso(new Date()),
    }),
    fetchMarket('econCalendar', {
      from: iso(new Date()), to: iso(new Date(Date.now() + 14 * 864e5)),
    }),
    earningsStrip(nav),
    newsStrip(nav),
    stocksTiles(nav),
    volumeAndVolatility(nav),
  ]);

  return [
    idx,
    stocksStrip(sect, tiles, nav),
    miniList('Gainers', gain, 'gainers', nav),
    miniList('Losers', lose, 'losers', nav),
    miniList('Most active', act, 'active', nav),
    ...volPair,
    etf,
    economyStrip(rates, cal, nav),
    earn,
    news,
    hubCard(nav),
  ];
}
