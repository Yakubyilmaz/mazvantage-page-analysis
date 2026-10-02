/* ==========================================================================
   Vanlior — Watchlists

   A reader's own list of companies, in the same dense table the Quotes
   screener uses, with the same column sets: Overview through Cash flow. The
   table is the screener's, not a copy of it — `markettable.js` owns the
   sorting, the paging, the column tabs and the per-company loading, and this
   page owns only *which* companies are in it.

   ---------------------------------------------------------------------------
   Where the rows come from, and what they cost
   ---------------------------------------------------------------------------

   A watchlist is a handful of symbols rather than a screened universe, so
   there is no screener call to build it from. `batch-quote` takes fifty
   symbols in one request and returns the price, the session, the volume and
   the market value — which is the whole Overview tab, free, however many lists
   a reader keeps.

   Everything else is per company and therefore bought, exactly as it is on the
   Quotes screener: a tab that needs ratios, statements or a profile says what
   it will cost and waits to be asked.

   ---------------------------------------------------------------------------
   The Vanlior Quant column
   ---------------------------------------------------------------------------

   This report's own composite, on the reduced set the screens use: a handful
   of ratios per factor, each ranked against **the company's own sector
   distribution**. That is why the column costs a profile as well as the
   ratios — without the sector there is no distribution to rank against, and a
   number ranked against the wrong sector would be worse than no number.

   It is the lite score, not the full report grade. A company's own page runs
   the whole model; this ranks what two feeds can answer.

   ---------------------------------------------------------------------------
   Storage
   ---------------------------------------------------------------------------

   Lists live in `localStorage` under one key, because they are this reader's
   and this browser's. Every read and write is wrapped: a private window with
   storage blocked should show an empty list and a working page, not a broken
   one.
   ========================================================================== */

import { el, isNum, dec } from './util.js';
import { fetchBatchQuotes, hasApiKey, logoUrl } from './fmp.js';
import { logo } from './ui.js';
import { marketTable, SCREENER_COLUMN_SETS, newTableState, fillBags } from './markettable.js';
import { loadSectorStats, sectorLookup, letterFor, toneForLetter, MAX_SCORE } from './grading.js';
import { scoreLite } from './model.js';
import { gradePill } from './gradeview.js';
import { emptyState, arrow } from './markethub-ui.js';
import { donut } from './charts.js';

const KEY = 'mazvantage.watchlists';
const newId = () => `wl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A symbol as the vendor spells it: upper case, no spaces, no $ prefix. */
const cleanSymbol = (value) => String(value || '').trim().toUpperCase().replace(/^\$/, '').replace(/\s+/g, '');

/* ---------- the store ------------------------------------------------------ */

const emptyStore = () => ({ active: null, lists: [] });

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || !Array.isArray(raw.lists)) return emptyStore();
    const lists = raw.lists
      .filter((l) => l && typeof l.name === 'string')
      .map((l) => ({
        id: l.id || newId(),
        name: l.name,
        symbols: (l.symbols || []).map(cleanSymbol).filter(Boolean),
        // What the reader holds and what they purify on it. Keyed by symbol
        // rather than parallel to `symbols`, so removing a ticker and adding it
        // back does not shuffle someone's share count onto another company.
        holdings: (l.holdings && typeof l.holdings === 'object') ? l.holdings : {},
      }));
    return { lists, active: lists.some((l) => l.id === raw.active) ? raw.active : lists[0]?.id || null };
  } catch { return emptyStore(); }
}

function writeStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
  return store;
}

/* ---------- the Vanlior Quant column ------------------------------------------

   `get` returns the number so the column sorts like any other; `fmt` draws the
   pill. A row whose bags are not loaded yet returns null, which the table
   already knows to sink to the bottom whichever way the column is sorted. */
function liteFor(row, stats) {
  const bags = row.bags;
  if (!bags?.ratios || !bags?.metrics) return null;
  const lookup = sectorLookup(stats, bags.profile?.sector || null);
  if (!lookup.available) return null;
  return scoreLite(bags, lookup);
}

function quantScore(row, stats) {
  const lite = liteFor(row, stats);
  return isNum(lite?.score) ? lite.score : null;
}

/**
 * The column sets: the screener's own, with Overview carrying the score.
 *
 * Adding `profile`, `ratios` and `metrics` to Overview's bags is what turns it
 * into a bought tab — the same trade the Quotes screener makes to show a Wall
 * Street rating there. The free columns still draw immediately; the score
 * fills when the reader asks.
 */
function columnSets(stats) {
  const quote = {
    key: 'overview',
    label: 'Overview',
    bags: ['profile', 'ratios', 'metrics'],
    columns: [
      { key: 'marketCap', label: 'Market cap', num: true, get: (r) => r.marketCap, fmt: fmtMoney },
      { key: 'price', label: 'Price', num: true, get: (r) => r.price, fmt: fmtPrice },
      { key: 'changePercentage', label: 'Day', num: true, get: (r) => r.changePercentage, fmt: fmtChange },
      { key: 'volume', label: 'Volume', num: true, get: (r) => r.volume, fmt: (v) => fmtNum(v) },
      { key: 'turnover', label: 'Traded value', num: true,
        get: (r) => (isNum(r.volume) && isNum(r.price) ? r.volume * r.price : null), fmt: fmtMoney },
      { key: 'quant', label: 'Vanlior Quant', num: true,
        get: (r) => quantScore(r, stats),
        fmt: (v) => (isNum(v) ? gradePill(v, letterFor(v)) : na()) },
      { key: 'sector', label: 'Sector', get: (r) => r.bags?.profile?.sector, fmt: (v) => v || na() },
      { key: 'exchange', label: 'Exchange', get: (r) => r.exchange, fmt: (v) => v || na() },
    ],
  };
  return SCREENER_COLUMN_SETS.map((set) => (set.key === 'overview' ? quote : set));
}

const na = () => el('span', { class: 'subtle', text: 'n/a' });
const compact = (value, options = {}) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2, ...options }).format(value);
const fmtMoney = (v) => (isNum(v) ? el('span', { text: `US$${compact(v)}` }) : na());
const fmtPrice = (v) => (isNum(v) ? el('span', { text: Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : na());
const fmtNum = (v) => (isNum(v) ? el('span', { text: compact(v) }) : na());
const fmtChange = (v) => (isNum(v)
  ? el('span', { class: v > 0 ? 'is-up' : v < 0 ? 'is-down' : '', text: `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%` })
  : na());

/* ==========================================================================
   The health score

   One number for a whole list: the mean of the Vanlior Quant composite across
   the holdings that could be scored.

   ---------------------------------------------------------------------------
   Equal weight, and it says so
   ---------------------------------------------------------------------------

   Every holding counts once, whatever it is worth. The page does know some
   position sizes — the purification block below collects shares held — but it
   knows them for whichever rows the reader has bothered to fill in, and a
   "value-weighted" score computed over a third of a list would be a worse
   number than an honest equal-weighted one. So: equal weight, stated.

   ---------------------------------------------------------------------------
   Scored, and not scored
   ---------------------------------------------------------------------------

   A holding is scored only where three feeds landed and its sector has a
   distribution to rank against. Everything else is **left out of the mean**
   rather than counted as a zero — the rule the whole report grades by — and
   the card prints how many of the list it actually averaged. A score over 4
   of 11 holdings is a different claim from a score over 11, and a reader who
   is not told which one they are reading cannot tell them apart.
   ========================================================================== */

/** The five factors, in the order the report grades them. */
const HEALTH_FACTORS = ['valuation', 'growth', 'health', 'profitability', 'momentum'];

const FACTOR_TITLES = {
  valuation: 'Valuation',
  growth: 'Growth',
  health: 'Financial Health',
  profitability: 'Profitability',
  momentum: 'Momentum',
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * The list's score, and the five factor means behind it.
 *
 * `scored` is what the mean was taken over; `total` is the list. They differ
 * whenever a feed is missing or a sector has no distribution, and the card
 * prints both.
 */
function healthScore(rows, stats) {
  const lites = rows.map((row) => liteFor(row, stats));
  const scored = lites.filter((l) => isNum(l?.score));
  const scores = scored.map((l) => l.score);

  const factors = HEALTH_FACTORS.map((key) => ({
    key,
    title: FACTOR_TITLES[key],
    score: mean(lites.map((l) => l?.factors?.[key]?.score).filter(isNum)),
  }));

  /* How many ratios each holding's score was built from. The model file is
     explicit that every surface printing a lite score prints this too: a
     score off four ratios and one off twenty-two are not comparable, and only
     the count says which you are reading. */
  const counts = scored.map((l) => l.scoredOn).filter(isNum);

  return {
    score: mean(scores),
    scored: scores.length,
    total: rows.length,
    factors,
    ratios: counts.length ? { min: Math.min(...counts), max: Math.max(...counts) } : null,
  };
}

/**
 * The card above the table.
 *
 * Drawn even when nothing is scored yet, because "this list has no health
 * score" is a state with a cause and a fix, and an empty space is neither.
 */
/**
 * The factors this page cannot reach, named.
 *
 * Growth and Momentum are graded from feeds the watchlist never buys — a
 * fiscal-year growth record and a year of prices — so their rows come back
 * blank on every list, for every company, always. A dash with no explanation
 * reads as a gap in the data for these particular holdings, which it is not:
 * it is a boundary of what three feeds can answer, and the composite above is
 * a mean of the three factors that did compute.
 */
function unreachedNote(h) {
  const missing = h.factors.filter((f) => !isNum(f.score));
  if (!missing.length) return null;
  const names = missing.map((f) => f.title);
  const list = names.length === 1 ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return el('p', { class: 'wl-health__note', text: `${list} ${names.length === 1 ? 'is' : 'are'} `
    + 'blank because this page buys three feeds per company and neither a fiscal-year growth '
    + 'record nor a year of prices is among them. The score above is a mean of the ratios that '
    + `did compute, so it is a reading of the other ${5 - names.length} factors rather than of `
    + 'all five. A company’s own report grades every one.' });
}

function healthBlock(list, rows, stats) {
  const h = healthScore(rows, stats);

  const head = el('div', { class: 'wl-health__head' }, [
    el('h2', { class: 'mh-heading mh-heading--section', text: 'Health score' }),
    isNum(h.score) ? gradePill(h.score, letterFor(h.score), { size: 'lg' }) : null,
  ].filter(Boolean));

  if (!isNum(h.score)) {
    return el('section', { class: 'wl-health', id: 'watchlist-health' }, [
      head,
      el('p', { class: 'mh-section-description', text: stats
        ? `Nothing in ${list.name} is scored yet. The composite ranks a company against its own `
          + 'sector, which costs a profile, a ratios call and a metrics call each — load them from '
          + 'the table below and the score fills in here.'
        : 'Loading the sector distributions the score ranks against…' }),
    ]);
  }

  const width = (h.score / MAX_SCORE) * 100;

  return el('section', { class: 'wl-health', id: 'watchlist-health' }, [
    head,
    el('p', { class: 'mh-section-description', text: 'The mean Vanlior Quant across this list — '
      + `every holding weighted equally, whatever it is worth. Averaged over ${h.scored} of `
      + `${h.total} ${h.total === 1 ? 'holding' : 'holdings'}`
      + (h.scored < h.total
        ? ', and the rest are left out rather than counted as a zero, so the score is not dragged '
          + 'down by a feed that did not land.'
        : ' — the whole list.')
      + (h.ratios
        ? ` Each holding was scored on ${h.ratios.min === h.ratios.max
          ? `${h.ratios.min} ratios` : `${h.ratios.min}–${h.ratios.max} ratios`}.`
        : '') }),

    el('div', { class: 'wl-health__score' }, [
      el('b', { text: dec(h.score, 2) }),
      el('i', { text: `/${MAX_SCORE}` }),
    ]),
    el('div', { class: 'gradebar' }, [
      el('div', {
        class: `gradebar__fill is-${toneForLetter(letterFor(h.score))}`,
        style: { width: `${width}%` },
      }),
    ]),

    el('p', { class: 'wl-health__sub', text: 'Each factor, averaged across the same holdings' }),
    el('div', { class: 'fgrades' }, h.factors.map((f) => el('div', { class: 'fgrades__row' }, [
      el('span', { class: 'fgrades__name', text: f.title }),
      el('span', { class: 'fgrades__track' }, [
        el('span', {
          class: `fgrades__fill is-${toneForLetter(letterFor(f.score))}`,
          style: { width: `${isNum(f.score) ? (f.score / MAX_SCORE) * 100 : 0}%` },
        }),
      ]),
      gradePill(f.score, letterFor(f.score)),
    ]))),

    unreachedNote(h),

    /* The five rows above do not average to the number at the top, and saying
       so is cheaper than letting a reader check and conclude the page is
       broken. The composite is the mean of every ratio that graded; the rows
       are means within each factor, and the factors hold different numbers of
       ratios. */
    el('p', { class: 'wl-health__note', text: 'The five rows do not average to the score above: '
      + 'the score is the mean of every ratio that graded, and the factors do not hold the same '
      + 'number of ratios each. This is the reduced composite the screens use — a handful of '
      + 'ratios per factor against the company’s own sector distribution, not the 77 a company’s '
      + 'own Ratings tab grades. It is a reading of the list, not a recommendation about it.' }),
  ]);
}

/* ==========================================================================
   Position sizes

   Four of the blocks on this page want to know how much of each company is
   held: the day's move in money, the dividend income, the allocation by
   value, and the purification amount. All four read one place — the
   `holdings` map on the list, which the purification table has always
   written and which is now editable from the allocation block too.

   **A size is never invented.** A list with no sizes entered is a watchlist
   rather than a portfolio, and the blocks say so and fall back to counting
   holdings rather than pretending each is worth the same amount of money.
   That distinction is the whole reason the fallback is labelled everywhere
   it is used: "equal weight" is a different claim from "by value", and a
   reader who is not told which one they are looking at cannot tell.
   ========================================================================== */

const sharesOf = (list, symbol) => {
  const v = Number(list.holdings?.[symbol]?.shares);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** What one holding is worth, where both the size and a price are known. */
const valueOf = (list, row) => {
  const shares = sharesOf(list, row.symbol);
  return isNum(shares) && isNum(row.price) ? shares * row.price : null;
};

/**
 * How much of the list is sized, and what it is worth.
 *
 * `basis` is the one word every block downstream prints: 'value' when every
 * holding carries a size, 'count' when none does, and 'partial' in between —
 * which is the interesting case, because a mixture is where a chart is most
 * likely to mislead. Nothing weights by value on a partial list.
 */
function sizing(list, rows) {
  const sized = rows.filter((r) => isNum(valueOf(list, r)));
  const total = sized.reduce((a, r) => a + valueOf(list, r), 0);
  return {
    sized: sized.length,
    total: rows.length,
    value: total > 0 ? total : null,
    basis: sized.length === 0 ? 'count' : sized.length === rows.length ? 'value' : 'partial',
  };
}

const money0 = (v) => (isNum(v) ? `US$${Math.round(v).toLocaleString('en-US')}` : 'n/a');
const money2s = (v) => (isNum(v) ? `US$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'n/a');
const pctText = (v, dp = 2) => (isNum(v) ? `${(v * 100).toFixed(dp)}%` : 'n/a');
const signedPct = (v, dp = 2) => (isNum(v) ? `${v >= 0 ? '+' : ''}${Number(v).toFixed(dp)}%` : 'n/a');

/** The heading every block on this page shares. */
function blockHead(title, aside) {
  return el('div', { class: 'wl-bhead' }, [
    el('h2', { class: 'mh-heading mh-heading--section', text: title }),
    aside || null,
  ].filter(Boolean));
}

/** A row's identity button, used by every block that lists companies. */
const openRow = (row, onOpen) => el('button', {
  type: 'button', class: 'mkticker', title: row.companyName || row.symbol,
  text: row.symbol, onclick: () => onOpen(row.symbol),
});

/* ==========================================================================
   1. Gainers and losers

   The only block on the page that costs nothing. `batch-quote` already
   carries the day's move for the whole list in the one request that built it,
   so this draws the moment the list does — before any tab has been bought,
   and whether or not the reader ever buys one.

   Both columns are shown even when one is empty, because "nothing fell today"
   is a fact about the day and an absent column reads as a missing feature.
   ========================================================================== */

function moversBlock(list, rows, onOpen) {
  const moved = rows.filter((r) => isNum(r.changePercentage));
  if (!moved.length) {
    return el('section', { class: 'wl-movers', id: 'watchlist-movers' }, [
      blockHead('Gainers and losers'),
      el('p', { class: 'mh-section-description', text: 'No quotes came back with a day’s move for '
        + 'this list, so there is nothing to rank. The day’s change arrives with the prices, in the '
        + 'same single request — if it is missing here it is missing from the table too.' }),
    ]);
  }

  const up = moved.filter((r) => r.changePercentage > 0).sort((a, b) => b.changePercentage - a.changePercentage);
  const down = moved.filter((r) => r.changePercentage < 0).sort((a, b) => a.changePercentage - b.changePercentage);
  const flat = moved.length - up.length - down.length;

  const size = sizing(list, rows);
  /* Two averages, and they answer different questions. The mean move is what
     the list did; the value-weighted move is what the money did, and it only
     exists where every holding is sized — a partial list would weight the
     sized names as if the rest were worth nothing. */
  const meanMove = moved.reduce((a, r) => a + r.changePercentage, 0) / moved.length;
  const weighted = size.basis === 'value' && size.value
    ? rows.reduce((a, r) => {
      const v = valueOf(list, r);
      return isNum(v) && isNum(r.changePercentage) ? a + (v / size.value) * r.changePercentage : a;
    }, 0)
    : null;
  const dayMoney = size.basis === 'value' && isNum(weighted) && isNum(size.value)
    ? size.value * (weighted / 100) : null;

  const column = (title, list2, tone) => el('div', { class: 'wl-movers__col' }, [
    el('p', { class: 'wl-movers__t', text: title }),
    list2.length
      ? el('ul', { class: 'wl-movers__list' }, list2.slice(0, 5).map((r) => el('li', { class: 'wl-mover' }, [
        openRow(r, onOpen),
        el('span', { class: 'wl-mover__n', title: r.companyName || '', text: r.companyName || '' }),
        el('span', { class: 'wl-mover__p', text: isNum(r.price) ? money2s(r.price) : 'n/a' }),
        el('span', { class: `wl-mover__c is-${tone}`, text: signedPct(r.changePercentage) }),
      ])))
      : el('p', { class: 'wl-movers__none', text: title === 'Gainers'
        ? 'Nothing in this list is up today.' : 'Nothing in this list is down today.' }),
  ]);

  return el('section', { class: 'wl-movers', id: 'watchlist-movers' }, [
    blockHead('Gainers and losers'),
    el('p', { class: 'mh-section-description', text: `${up.length} up, ${down.length} down`
      + (flat ? `, ${flat} unchanged` : '')
      + `. The list averages ${signedPct(meanMove)} today, counting every holding once`
      + (isNum(weighted)
        ? `; weighted by what you hold it is ${signedPct(weighted)}, or ${money0(dayMoney)}.`
        : size.basis === 'partial'
          ? `. ${size.sized} of ${size.total} holdings are sized, so there is no figure for what `
            + 'the money did — a weighted average over part of a list would treat the rest as '
            + 'worth nothing.'
          : '. Enter shares held under Asset allocation to see what the money did.') }),

    el('div', { class: 'wl-movers__grid' }, [
      column('Gainers', up, 'up'),
      column('Losers', down, 'down'),
    ]),
  ]);
}

/* ==========================================================================
   2. Dividends

   Trailing twelve months, per holding and totalled. The per-share payment and
   the yield both come off the `ratios` feed the Overview tab already buys, so
   this block costs nothing beyond what the table has: the figures are there
   the moment the score column is.

   The income column needs a position size and is blank without one. The yield
   column never does — a yield is a property of the company, not of how much
   of it you own — which is why the block is worth drawing on an unsized list
   and does.
   ========================================================================== */

function dividendsBlock(list, rows, onOpen) {
  const ready = rows.filter((r) => r.bags?.ratios);
  const size = sizing(list, rows);

  const head = blockHead('Dividends');

  if (!ready.length) {
    return el('section', { class: 'wl-divs', id: 'watchlist-dividends' }, [
      head,
      el('p', { class: 'mh-section-description', text: 'The payment and the yield come off the '
        + 'same ratios feed the Overview tab buys — load it from the table above and this fills '
        + 'in. Nothing extra is requested for it.' }),
    ]);
  }

  const priced = ready.map((row) => {
    const dps = dividendPerShare(row);
    const ratios = row.bags.ratios;
    const yieldPct = isNum(Number(ratios.dividendYieldTTM)) ? Number(ratios.dividendYieldTTM)
      : (isNum(dps) && isNum(row.price) && row.price > 0 ? dps / row.price : null);
    const shares = sharesOf(list, row.symbol);
    return {
      row, dps, yieldPct, shares,
      income: isNum(dps) && isNum(shares) ? dps * shares : null,
    };
  });

  const payers = priced.filter((p) => isNum(p.dps) && p.dps > 0);
  const income = payers.map((p) => p.income).filter(isNum);
  const totalIncome = income.length ? income.reduce((a, b) => a + b, 0) : null;

  /* The list's yield on cost of nothing: income over market value. Only where
     every holding is sized, for the same reason the weighted day move is —
     dividing a partial income by a partial value happens to be right, but
     dividing it by the whole list's value is not, and the two are one edit
     apart. The average yield across payers is always shown, and is a
     different number: it counts a small position and a large one alike. */
  const portfolioYield = size.basis === 'value' && isNum(totalIncome) && size.value
    ? totalIncome / size.value : null;
  const avgYield = payers.length
    ? payers.map((p) => p.yieldPct).filter(isNum).reduce((a, b) => a + b, 0)
      / payers.map((p) => p.yieldPct).filter(isNum).length
    : null;

  const body = priced
    .sort((a, b) => (b.yieldPct ?? -1) - (a.yieldPct ?? -1))
    .map((p) => el('tr', { class: isNum(p.dps) && p.dps > 0 ? '' : 'is-idle' }, [
      el('td', { class: 'mi-table__id' }, [
        openRow(p.row, onOpen),
        el('span', { class: 'wl-purify__co', text: p.row.companyName || '' }),
      ]),
      el('td', { class: 'num', text: isNum(p.yieldPct) && p.yieldPct > 0 ? pctText(p.yieldPct) : '—' }),
      el('td', { class: 'num', text: isNum(p.dps) && p.dps > 0 ? money2s(p.dps) : '—' }),
      el('td', { class: 'num', text: isNum(p.shares) ? p.shares.toLocaleString('en-US') : '—' }),
      el('td', { class: 'num' }, [isNum(p.income)
        ? el('strong', { text: money2s(p.income) })
        : el('span', { class: 'wl-divs__na', text: '—' })]),
    ]));

  return el('section', { class: 'wl-divs', id: 'watchlist-dividends' }, [
    head,
    el('p', { class: 'mh-section-description', text: `${payers.length} of ${ready.length} `
      + `${ready.length === 1 ? 'holding pays' : 'holdings pay'} a dividend. Everything here is `
      + 'the trailing twelve months as filed — what was actually paid, not what is forecast.'
      + (isNum(avgYield) ? ` The payers average ${pctText(avgYield)}, counting each once.` : '') }),

    el('div', { class: 'wl-scroll' }, [
      el('table', { class: 'mi-table wl-purify__table' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Holding' }),
          el('th', { class: 'num', text: 'Yield (TTM)' }),
          el('th', { class: 'num', text: 'Per share' }),
          el('th', { class: 'num', text: 'Shares' }),
          el('th', { class: 'num', text: 'Income a year' }),
        ])]),
        el('tbody', {}, body),
      ]),
    ]),

    el('div', { class: 'wl-divs__total' }, [
      el('span', { class: 'wl-divs__total-k', text: 'Income a year' }),
      el('strong', { class: 'wl-divs__total-v', text: income.length ? money2s(totalIncome) : '—' }),
      el('span', { class: 'wl-divs__total-n', text: income.length
        ? `across ${income.length} sized ${income.length === 1 ? 'holding' : 'holdings'}`
          + (isNum(portfolioYield) ? ` · ${pctText(portfolioYield)} on what the list is worth` : '')
        : 'enter shares held under Asset allocation to turn the yields into money' }),
    ]),
  ]);
}

/* ==========================================================================
   3. Asset allocation

   By sector, and by two bases the reader picks between: how many holdings sit
   in each sector, and how much money does. The second is disabled until every
   holding carries a size, and the button says why rather than being quietly
   absent.

   The sizes are edited here rather than only in the purification table below,
   because this is the block that makes them worth entering.
   ========================================================================== */

/* Far enough apart on the wheel that adjacent slices of a donut do not read
   as one band. Eleven sectors, eleven colours, then grey for the rest. */
const SECTOR_COLORS = [
  'var(--chart-01)', 'var(--chart-04)', 'var(--chart-02)', 'var(--chart-05)',
  'var(--chart-03)', 'var(--chart-06)', 'var(--good)', 'var(--warning)',
  'var(--bad)', 'var(--brand-01)', 'var(--text-subtle)',
];

function allocationBlock(list, rows, onSave, onOpen, onResize) {
  const host = el('section', { class: 'wl-alloc', id: 'watchlist-allocation' });

  const draw = () => {
    const known = rows.filter((r) => r.bags?.profile?.sector);
    const size = sizing(list, rows);
    // A list that stops being fully sized cannot stay on the value basis.
    if (allocBasis === 'value' && size.basis !== 'value') allocBasis = 'count';
    const basis = allocBasis;

    const toggle = el('div', { class: 'mh-ideas__rail' }, [
      ['count', 'By holding'],
      ['value', 'By value'],
    ].map(([id, label]) => {
      const blocked = id === 'value' && size.basis !== 'value';
      return el('button', {
        type: 'button',
        class: `mh-idea${basis === id ? ' is-active' : ''}${blocked ? ' is-blocked' : ''}`,
        'aria-pressed': String(basis === id),
        disabled: blocked ? true : null,
        title: blocked
          ? `Weighting by value needs a size on every holding — ${size.sized} of ${size.total} have one.`
          : null,
        text: label,
        onclick: () => { if (!blocked) { allocBasis = id; draw(); } },
      });
    }));

    const note = el('p', { class: 'mh-section-description', text: known.length
      ? (basis === 'value'
        ? `Where the money sits. ${money0(size.value)} across ${size.total} holdings, each weighted `
          + 'by what it is worth today.'
        : 'How many holdings sit in each sector — every one counted once, whatever it is worth.'
          + (size.basis === 'value'
            ? ' Switch to By value to weight them by what you hold.'
            : size.basis === 'partial'
              ? ` ${size.sized} of ${size.total} holdings are sized; enter the rest below to weight `
                + 'this by value.'
              : ' Enter shares held below to weight this by value instead.'))
      : 'The sector comes off the same profile feed the Overview tab buys — load it from the table '
        + 'above and this fills in. Nothing extra is requested for it.' });

    if (!known.length) {
      host.replaceChildren(blockHead('Asset allocation'), note);
      return;
    }

    const bySector = new Map();
    for (const row of known) {
      const sector = row.bags.profile.sector;
      const weight = basis === 'value' ? valueOf(list, row) : 1;
      if (!isNum(weight)) continue;
      const cell = bySector.get(sector) || { name: sector, value: 0, names: [] };
      cell.value += weight;
      cell.names.push(row.symbol);
      bySector.set(sector, cell);
    }

    const slices = [...bySector.values()]
      .sort((a, b) => b.value - a.value)
      .map((s, i) => ({
        ...s,
        color: SECTOR_COLORS[i % SECTOR_COLORS.length],
        display: basis === 'value' ? money0(s.value)
          : `${s.value} ${s.value === 1 ? 'holding' : 'holdings'}`,
      }));

    const total = slices.reduce((a, s) => a + s.value, 0);
    const unknown = rows.length - known.length;

    /* Filtered, because `replaceChildren` is not `el`: it turns a null child
       into the text "null" on the page. The same trap `markettable.js`
       records, and it printed `null` under the donut on a list where every
       holding had a sector. */
    host.replaceChildren(...[
      blockHead('Asset allocation', toggle),
      note,
      el('div', { class: 'wl-alloc__grid' }, [
        el('div', { class: 'wl-alloc__chart' }, [
          donut(slices, {
            size: 220,
            centerValue: String(slices.length),
            centerLabel: slices.length === 1 ? 'sector' : 'sectors',
          }),
        ]),
        el('ul', { class: 'wl-alloc__list' }, slices.map((s) => el('li', { class: 'wl-alloc__row' }, [
          el('span', { class: 'wl-alloc__swatch', style: { background: s.color } }),
          el('span', { class: 'wl-alloc__name', text: s.name }),
          el('span', { class: 'wl-alloc__names', text: s.names.join(', ') }),
          el('span', { class: 'wl-alloc__share', text: pctText(s.value / total, 1) }),
        ]))),
      ]),

      unknown
        ? el('p', { class: 'wl-alloc__gap', text: `${unknown} of ${rows.length} `
          + `${unknown === 1 ? 'holding has' : 'holdings have'} no sector on file and `
          + `${unknown === 1 ? 'is' : 'are'} left out of the split rather than filed under Other — `
          + 'an invented sector would move every share above it.' })
        : null,

      /* `onResize` and not this block's own `draw`: a size changes the day's
         move in money and the dividend income as much as it changes the
         allocation, and those two are drawn above the table by the page. The
         basis toggle above stays local, because nothing else on the page
         cares which basis this chart is on. */
      sizesEditor(list, rows, onSave, onResize, onOpen),
    ].filter(Boolean));
  };

  draw();
  return host;
}

/**
 * Shares held, per company.
 *
 * The same `holdings` map the purification table writes, edited here because
 * this is where the reader first meets a block that wants it. Only the cell
 * being typed into is live — redrawing the whole editor on a keystroke would
 * take the caret with it — so the blocks around it refresh on `change`, when
 * the field is done with.
 */
/* Two pieces of state that belong to the reader rather than to a render.
   Entering a size rebuilds the page — the day's move and the dividend income
   both change with it — and a reader who had opened the editor and switched
   the chart to By value should not be put back to a closed editor on By
   holding by their own first keystroke. */
let sizesOpen = false;
let allocBasis = 'count';

function sizesEditor(list, rows, onSave, onDone, onOpen) {
  const fields = rows.map((row) => {
    const held = list.holdings[row.symbol] = list.holdings[row.symbol] || {};
    const input = el('input', {
      type: 'number', min: '0', step: 'any', class: 'wl-cell',
      value: held.shares ?? '', 'aria-label': `Shares of ${row.symbol} held`,
    });
    input.addEventListener('input', () => {
      held.shares = input.value === '' ? null : Number(input.value);
      onSave();
    });
    // Redraw once the field is finished with, not on every digit typed.
    input.addEventListener('change', () => onDone());
    return el('label', { class: 'wl-size' }, [
      el('span', { class: 'wl-size__k' }, [openRow(row, onOpen)]),
      input,
    ]);
  });

  /* Open across a redraw: finishing a field rebuilds the page, and an editor
     that closed itself every time a number was entered would have to be
     reopened once per holding. */
  const box = el('details', { class: 'wl-sizes', open: sizesOpen || null }, [
    el('summary', { text: 'Shares held' }),
    el('p', { class: 'wl-sizes__b', text: 'Kept in this browser with the list itself, and used by '
      + 'the day’s move, the dividend income and the allocation above. Leave a holding blank and it '
      + 'is counted rather than weighted — nothing here is estimated for you.' }),
    el('div', { class: 'wl-sizes__grid' }, fields),
  ]);
  box.addEventListener('toggle', () => { sizesOpen = box.open; });
  return box;
}

/* ==========================================================================
   4. The calendar

   What is coming up for the companies held, rather than for the market. The
   Calendar page fetches a week of the whole market and filters nothing; this
   asks each company for its own dates, because a holding's next results are
   often a quarter out and a week of the market would miss almost all of them.

   Two requests per company, which is why it waits to be asked. An earnings
   row with no reported figure is a date the vendor expects; a dividend row is
   only there once the payment has actually been declared, so a payer with
   nothing listed has not declared its next one — which the block says rather
   than leaving a blank that reads as a missing feed.
   ========================================================================== */

const CAL_BAGS = ['earnings', 'dividends'];
const DAY_MS = 86400000;

/** `YYYY-MM-DD` as a UTC midnight, so a date never shifts by a time zone. */
function utcDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmtDay = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** How far off, in the words a reader would use. */
function whenText(at, today) {
  const days = Math.round((at - today) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 14) return 'next week';
  if (days < 61) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

function calendarBlock(list, rows, onOpen, onLoaded) {
  const host = el('section', { class: 'wl-cal', id: 'watchlist-calendar' });

  const draw = () => {
    const missing = rows.filter((r) => CAL_BAGS.some((b) => !r.bags?.[b]));

    if (missing.length === rows.length) {
      const progress = el('span', { class: 'mi-progress', 'aria-live': 'polite' });
      const button = el('button', {
        type: 'button', class: 'mi-load',
        text: `Load the dates for these ${rows.length} — two requests each`,
        onclick: async () => {
          button.disabled = true;
          button.textContent = 'Loading…';
          await fillBags(rows, CAL_BAGS, (done, total) => { progress.textContent = ` ${done} of ${total}…`; });
          progress.textContent = '';
          onLoaded();
        },
      });
      host.replaceChildren(
        blockHead('Calendar'),
        el('p', { class: 'mh-section-description', text: 'The next results date and the next '
          + 'dividend for each company held. Each one is asked for its own dates rather than the '
          + 'market’s: a holding’s next results are usually a quarter out, and a week of the '
          + 'market’s calendar would miss almost all of them.' }),
        el('div', { class: 'gp-consent' }, [button, progress]),
      );
      return;
    }

    const today = utcDay(new Date().toISOString());
    const events = [];

    for (const row of rows) {
      /* An earnings row with no reported EPS is a date the vendor is
         expecting rather than one it has filed. Past dates with no actual are
         dropped: a "scheduled" date that has already gone by means the vendor
         never updated it, not that the results are still to come. */
      for (const e of (Array.isArray(row.bags?.earnings) ? row.bags.earnings : [])) {
        const at = utcDay(e.date);
        if (!at || at < today) continue;
        if (e.epsActual != null) continue;
        events.push({
          at, row, kind: 'earnings', label: 'Results',
          detail: isNum(Number(e.epsEstimated))
            ? `${money2s(Number(e.epsEstimated))} a share expected`
            : 'no estimate published',
        });
      }

      for (const d of (Array.isArray(row.bags?.dividends) ? row.bags.dividends : [])) {
        const at = utcDay(d.date);
        if (!at || at < today) continue;
        const amount = Number(d.adjDividend ?? d.dividend);
        const shares = sharesOf(list, row.symbol);
        events.push({
          at, row, kind: 'dividend', label: 'Ex-dividend',
          detail: (isNum(amount) ? `${money2s(amount)} a share` : 'amount not stated')
            + (isNum(amount) && isNum(shares) ? ` · ${money2s(amount * shares)} to you` : '')
            + (d.frequency ? ` · ${String(d.frequency).toLowerCase()}` : ''),
        });
      }
    }

    events.sort((a, b) => a.at - b.at || a.row.symbol.localeCompare(b.row.symbol));

    const noDates = rows.filter((r) => !events.some((e) => e.row.symbol === r.symbol));

    host.replaceChildren(...[
      blockHead('Calendar'),
      el('p', { class: 'mh-section-description', text: events.length
        ? `${events.length} dated ${events.length === 1 ? 'event' : 'events'} ahead across `
          + `${new Set(events.map((e) => e.row.symbol)).size} of ${rows.length} holdings. Results `
          + 'dates are the vendor’s expectation until the figures are filed; a dividend appears '
          + 'only once it has been declared.'
        : 'Nothing is scheduled ahead for these companies. Results dates appear once the vendor '
          + 'expects one, and a dividend once it has been declared — neither is forecast here.' }),

      events.length
        ? el('div', { class: 'wl-scroll' }, [
          el('table', { class: 'mi-table wl-cal__table' }, [
            el('thead', {}, [el('tr', {}, [
              el('th', { text: 'Date' }),
              el('th', { text: 'Holding' }),
              el('th', { text: 'Event' }),
              el('th', { text: 'Detail' }),
            ])]),
            el('tbody', {}, events.slice(0, 40).map((e) => el('tr', {}, [
              el('td', { class: 'wl-cal__when' }, [
                el('b', { text: fmtDay(e.at) }),
                el('span', { text: whenText(e.at, today) }),
              ]),
              el('td', { class: 'mi-table__id' }, [
                openRow(e.row, onOpen),
                el('span', { class: 'wl-purify__co', text: e.row.companyName || '' }),
              ]),
              el('td', {}, [el('span', { class: `wl-cal__tag is-${e.kind}`, text: e.label })]),
              el('td', { class: 'wl-cal__detail', text: e.detail }),
            ]))),
          ]),
        ])
        : null,

      noDates.length && events.length
        ? el('p', { class: 'wl-cal__gap', text: `Nothing ahead for ${noDates.map((r) => r.symbol).join(', ')}`
          + ' — either the next results date has not been published or, for a payer, the next '
          + 'dividend has not been declared.' })
        : null,
    ].filter(Boolean));
  };

  draw();
  return host;
}

/* ==========================================================================
   Purification

   Passing a compliance screen does not make the whole of a dividend
   permissible: a company can clear both balance-sheet ratios and still earn a
   slice of its income from interest or from an incidental non-compliant
   activity, and the convention is that the same slice of any dividend received
   is given away rather than kept. The arithmetic is three steps, and this app
   has two of them:

     1. **The impure fraction.** Non-compliant income ÷ total income.
     2. **Per share.** That fraction × the dividend per share received.
     3. **The amount.** Per share × shares held, annually or by the month.

   Steps two and three are data this page already has. Step one is not, and
   this is the part worth being exact about rather than papering over:

   FMP's income statement carries an `interestIncome` line, and it is populated
   for some filers and zero for others — Microsoft's last year reports $3.3bn,
   Apple's reports **zero**, which is a gap in the vendor's parsing rather than
   a finding about Apple's cash. A ratio computed from that field alone would
   therefore tell a reader "nothing to purify" precisely where the data is
   missing, which is the worst direction for this number to be wrong in.

   So the field is offered as a **starting figure where the filing reports
   one**, clearly labelled, and the cell is editable: the authoritative number
   is the company's own annual report, or the purification ratio an index
   provider publishes for its constituents. Neither is in this data plan. What
   the page does is the arithmetic, honestly, around whichever fraction the
   reader supplies.

   It is a calculation, not a ruling. Scholars differ on whether capital gains
   as well as dividends require purification, and on whether the fraction runs
   on income or on revenue.
   ========================================================================== */

/** Both feeds are per company, so the block says what it costs before loading. */
const PURIFY_BAGS = ['ratios', 'income'];
const MONTHS = 12;

/** The dividend a share paid over the trailing year. */
function dividendPerShare(row) {
  const ratios = row.bags?.ratios;
  if (!ratios) return null;
  if (isNum(ratios.dividendPerShareTTM)) return Number(ratios.dividendPerShareTTM);
  // The yield is a fraction of the price, so the two multiply back to the
  // payment. Used only when the per-share line itself is absent.
  if (isNum(ratios.dividendYieldTTM) && isNum(row.price)) return Number(ratios.dividendYieldTTM) * row.price;
  return null;
}

/** Interest income as a share of revenue, where the filing reports one. */
function reportedInterestShare(row) {
  const income = row.bags?.income;
  if (!income) return null;
  const interest = Number(income.interestIncome);
  const revenue = Number(income.revenue);
  if (!Number.isFinite(interest) || !Number.isFinite(revenue) || revenue <= 0) return null;
  return { share: (interest / revenue) * 100, reported: interest > 0, year: income.fiscalYear || income.date };
}

const money2 = (v) => `US$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The block under the table.
 *
 * `holdings` is mutated and written through `onSave` as the reader types, and
 * only the derived cells are redrawn — replacing the inputs on every keystroke
 * would take the caret with them.
 */
function purificationBlock(list, rows, onSave, onOpen, onShariah) {
  const host = el('section', { class: 'wl-purify', id: 'watchlist-purification' });
  let period = 'annual';
  const holdings = list.holdings;

  const draw = () => {
    const payers = rows.filter((r) => isNum(dividendPerShare(r)));
    const needsFill = rows.some((r) => PURIFY_BAGS.some((b) => !r.bags?.[b]));
    const per = period === 'annual' ? 1 : 1 / MONTHS;

    const heading = el('div', { class: 'wl-purify__head' }, [
      el('h2', { class: 'mh-heading mh-heading--section', text: 'Purification' }),
      el('div', { class: 'mh-ideas__rail' }, [['annual', 'Annual'], ['monthly', 'Monthly']].map(([id, label]) => el('button', {
        type: 'button', class: `mh-idea${period === id ? ' is-active' : ''}`, 'aria-pressed': String(period === id),
        text: label, onclick: () => { period = id; draw(); },
      }))),
    ]);

    const note = el('p', { class: 'mh-section-description', text: 'The share of a dividend that convention says is given away rather than kept. This page does the arithmetic — dividend per share, shares held, annually or by the month. The impure fraction itself is yours to set: the authoritative source is the company’s annual report or the purification ratio an index provider publishes, and neither is in this data plan.' });

    if (needsFill) {
      const progress = el('span', { class: 'mi-progress', 'aria-live': 'polite' });
      const button = el('button', {
        type: 'button', class: 'mi-load',
        text: `Load dividends and income lines for these ${rows.length} — two requests each`,
        onclick: async () => {
          button.disabled = true;
          button.textContent = 'Loading…';
          await fillBags(rows, PURIFY_BAGS, (done, total) => { progress.textContent = ` ${done} of ${total}…`; });
          progress.textContent = '';
          draw();
        },
      });
      host.replaceChildren(heading, note, el('div', { class: 'gp-consent' }, [button, progress]));
      return;
    }

    if (!payers.length) {
      host.replaceChildren(heading, note, el('p', { class: 'wl-purify__none', text: 'None of these companies paid a dividend over the trailing year, so there is nothing to purify from dividends. Scholars differ on whether capital gains require purification too; that question is not one this page answers.' }));
      return;
    }

    const totalCell = el('strong', { class: 'wl-purify__total-v' });
    const totalNote = el('span', { class: 'wl-purify__total-n' });
    const rowNodes = [];

    const recompute = () => {
      let total = 0;
      let counted = 0;
      for (const { row, cells } of rowNodes) {
        const held = holdings[row.symbol] || {};
        const dps = dividendPerShare(row);
        const shares = Number(held.shares);
        const impure = Number(held.impure);
        const received = isNum(dps) && Number.isFinite(shares) && shares > 0 ? dps * shares * per : null;
        const owed = received != null && Number.isFinite(impure) && impure > 0 ? received * (impure / 100) : null;
        cells.received.replaceChildren(received == null ? na() : el('span', { text: money2(received) }));
        cells.owed.replaceChildren(owed == null ? na() : el('strong', { text: money2(owed) }));
        cells.row.classList.toggle('is-idle', owed == null);
        if (owed != null) { total += owed; counted += 1; }
      }
      totalCell.textContent = counted ? money2(total) : '—';
      totalNote.textContent = counted
        ? `${period === 'annual' ? 'a year' : 'a month'}, across ${counted} ${counted === 1 ? 'holding' : 'holdings'}`
        : 'enter shares held and an impure fraction to see the amount';
    };

    const body = payers.map((row) => {
      const held = holdings[row.symbol] = holdings[row.symbol] || {};
      const dps = dividendPerShare(row);
      const reported = reportedInterestShare(row);
      if (held.impure == null && reported?.reported) held.impure = Number(reported.share.toFixed(3));

      const shares = el('input', { type: 'number', min: '0', step: 'any', class: 'wl-cell', value: held.shares ?? '',
        'aria-label': `Shares of ${row.symbol} held` });
      const impure = el('input', { type: 'number', min: '0', max: '100', step: 'any', class: 'wl-cell', value: held.impure ?? '',
        'aria-label': `Impure fraction for ${row.symbol}, per cent` });
      shares.addEventListener('input', () => { held.shares = shares.value === '' ? null : Number(shares.value); onSave(); recompute(); });
      impure.addEventListener('input', () => { held.impure = impure.value === '' ? null : Number(impure.value); onSave(); recompute(); });

      const cells = {
        received: el('td', { class: 'num' }),
        owed: el('td', { class: 'num' }),
      };
      const tr = el('tr', {}, [
        el('td', { class: 'mi-table__id' }, [
          el('button', { type: 'button', class: 'mkticker', text: row.symbol, onclick: () => onOpen(row.symbol) }),
          el('span', { class: 'wl-purify__co', text: row.companyName || '' }),
        ]),
        el('td', { class: 'num', text: isNum(dps) ? money2(dps * per) : 'n/a' }),
        el('td', { class: 'num' }, [shares]),
        cells.received,
        el('td', { class: 'num' }, [impure,
          el('span', { class: 'wl-purify__src', title: reported
            ? `Interest income ÷ revenue, ${reported.year}`
            : 'The income statement for this company is not loaded',
          text: reported ? (reported.reported ? `filing: ${reported.share.toFixed(2)}%` : 'filing reports none') : '' })]),
        cells.owed,
      ]);
      cells.row = tr;
      rowNodes.push({ row, cells });
      return tr;
    });

    host.replaceChildren(
      heading,
      note,
      el('div', { class: 'mi-table__scroll' }, [
        el('table', { class: 'mi-table wl-purify__table' }, [
          el('thead', {}, [el('tr', {}, [
            el('th', { scope: 'col', text: 'Company' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: period === 'annual' ? 'Dividend / share' : 'Dividend / share, monthly' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: 'Shares held' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: 'Dividend received' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: 'Impure %' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: 'To purify' }),
          ])]),
          el('tbody', {}, body),
        ]),
      ]),
      el('div', { class: 'wl-purify__total' }, [
        el('span', { class: 'wl-purify__total-k', text: 'To purify' }),
        totalCell,
        totalNote,
      ]),
      el('button', { type: 'button', class: 'mh-see-all', onclick: onShariah },
        ['Check these against the compliance screen', arrow()]),
      el('p', { class: 'mh-panel-note', text: 'The dividend is the trailing twelve months as the vendor reports it, not a forecast, and the monthly view is that year divided by twelve rather than a schedule of payments. Where a filing reports an interest-income line, its share of revenue is offered as a starting figure — it covers interest only, not revenue from non-compliant activities, so it is a floor rather than the full fraction, and a company whose filing reports none is a gap in the data rather than a company with nothing to purify. This is a calculation, not a ruling.' }),
    );
    recompute();
  };

  draw();
  return host;
}

/* ---------- the page ------------------------------------------------------- */

export function renderWatchlistPage(sub, nav = {}) {
  let store = readStore();
  let stats = null;
  let rows = [];
  let status = { state: hasApiKey() ? 'loading' : 'skipped', message: '' };
  let disposed = false;
  let state = newTableState(columnSets(null));

  const page = el('main', { class: 'mh-page mi-page wl-page', id: 'watchlist' });
  const lists = el('nav', { class: 'mh-navigation wl-lists', 'aria-label': 'Watchlists' });
  const tools = el('div', { class: 'wl-tools' });
  const tabHost = el('div');
  const tableHost = el('div', { class: 'wl-table' });
  const meta = el('div', { class: 'mh-hero__meta' });
  const title = el('h1', { class: 'mi-title', text: 'Watchlist' });

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'WATCHLIST' }),
      title,
      meta,
    ]),
    lists, tools, tabHost, tableHost,
  );
  page.dispose = () => { disposed = true; };

  const activeList = () => store.lists.find((l) => l.id === store.active) || null;

  /* ---- loading the rows --------------------------------------------------
     One request per fifty symbols, and only for the list on screen: switching
     lists reloads, rather than holding every list's quotes in memory. */
  async function load() {
    const list = activeList();
    rows = [];
    if (!list || !list.symbols.length) { status = { state: 'empty', message: '' }; draw(); return; }
    if (!hasApiKey()) { status = { state: 'skipped', message: '' }; draw(); return; }
    status = { state: 'loading', message: '' };
    draw();
    const result = await fetchBatchQuotes(list.symbols);
    if (disposed) return;
    if (result.status !== 'ok') { status = { state: result.status, message: result.message || '' }; draw(); return; }
    const quoted = new Map((result.data || []).map((q) => [String(q.symbol).toUpperCase(), q]));
    /* A symbol the vendor does not know still gets a row, with its numbers
       blank: a watchlist that silently drops what it cannot price would leave
       the reader wondering where their ticker went. */
    rows = list.symbols.map((symbol) => {
      const q = quoted.get(symbol) || {};
      return {
        symbol,
        companyName: q.name || '',
        price: num(q.price), changePercentage: num(q.changePercentage ?? q.changesPercentage),
        volume: num(q.volume), marketCap: num(q.marketCap ?? q.mktCap),
        exchange: q.exchange || q.exchangeShortName || '',
        found: !!quoted.get(symbol),
        bags: {},
      };
    });
    status = { state: 'ok', message: '' };
    draw();
  }
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

  /* ---- the list tabs ------------------------------------------------------ */
  function drawLists() {
    lists.replaceChildren(
      ...store.lists.map((list) => el('button', {
        type: 'button', 'data-list': list.id,
        class: list.id === store.active ? 'is-active' : '',
        'aria-current': list.id === store.active ? 'page' : null,
        onclick: () => { if (list.id === store.active) return; store.active = list.id; writeStore(store); load(); },
      }, [list.name, el('span', { class: 'wl-count', text: String(list.symbols.length) })])),
      el('button', { type: 'button', class: 'wl-new', text: '+ New list', onclick: () => {
        const list = { id: newId(), name: `Watchlist ${store.lists.length + 1}`, symbols: [], holdings: {} };
        store.lists.push(list);
        store.active = list.id;
        writeStore(store);
        load();
      } }),
    );
  }

  /* ---- the toolbar -------------------------------------------------------- */
  function drawTools() {
    const list = activeList();
    if (!list) { tools.replaceChildren(); return; }
    const input = el('input', { type: 'search', class: 'wl-add', placeholder: 'Add a symbol — AAPL',
      'aria-label': 'Add a symbol to this watchlist' });
    const add = () => {
      const symbol = cleanSymbol(input.value);
      if (!symbol) return;
      if (!list.symbols.includes(symbol)) list.symbols.push(symbol);
      input.value = '';
      writeStore(store);
      load();
    };
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') add(); });

    tools.replaceChildren(
      el('div', { class: 'wl-add__row' }, [input, el('button', { type: 'button', class: 'wl-btn wl-btn--go', text: 'Add', onclick: add })]),
      el('div', { class: 'wl-tools__acts' }, [
        el('button', { type: 'button', class: 'wl-btn', text: 'Rename', onclick: () => {
          const name = el('input', { class: 'wl-add', value: list.name, 'aria-label': 'List name' });
          const done = () => { const value = name.value.trim(); if (value) { list.name = value; writeStore(store); } drawLists(); drawTools(); };
          name.addEventListener('keydown', (event) => { if (event.key === 'Enter') done(); });
          tools.replaceChildren(el('div', { class: 'wl-add__row' }, [name,
            el('button', { type: 'button', class: 'wl-btn wl-btn--go', text: 'Save', onclick: done })]));
          name.focus();
        } }),
        el('button', { type: 'button', class: 'wl-btn', text: 'Delete list', onclick: () => {
          // Deleting the last list leaves none rather than resurrecting a
          // default: an empty page says what to do next.
          store.lists = store.lists.filter((l) => l.id !== list.id);
          store.active = store.lists[0]?.id || null;
          writeStore(store);
          load();
        } }),
      ]),
    );
  }

  /* ---- the table ---------------------------------------------------------- */
  const identity = (row) => el('div', { class: 'wl-identity' }, [
    el('button', { type: 'button', class: 'ms-screen-identity', title: row.companyName || row.symbol,
      onclick: () => nav.goSymbol?.(row.symbol) }, [
      logo(logoUrl(row.symbol), row.symbol, { size: 'xs', fallback: 'letter' }),
      el('strong', { class: 'ms-screen-symbol', text: row.symbol }),
      el('span', { class: 'ms-screen-company', text: row.found ? (row.companyName || '') : 'Not found by FMP' }),
    ]),
    el('button', { type: 'button', class: 'wl-remove', title: `Remove ${row.symbol}`, 'aria-label': `Remove ${row.symbol}`,
      text: '×', onclick: () => {
        const list = activeList();
        if (!list) return;
        list.symbols = list.symbols.filter((s) => s !== row.symbol);
        writeStore(store);
        load();
      } }),
  ]);

  function tabs(sets) {
    return el('nav', { class: 'ms-screen-tabs', 'aria-label': 'Table views' }, sets.map((set) => el('button', {
      type: 'button', class: set.key === state.set ? 'is-active' : '',
      text: set.label,
      onclick: () => { if (set.key === state.set) return; state.set = set.key; state.page = 1; draw(); },
    })));
  }

  function draw() {
    const list = activeList();
    const sets = columnSets(stats);
    drawLists();
    drawTools();
    title.textContent = list ? list.name : 'Watchlists';
    meta.replaceChildren(el('span', { text: list
      ? `${list.symbols.length} ${list.symbols.length === 1 ? 'symbol' : 'symbols'} · kept in this browser`
      : 'No lists yet — make one and add the companies you follow.' }));

    /* The two empty states are first-run copy rather than `emptyState`: that
       component titles an empty result "No results available", which is right
       for a screen that returned nothing and wrong for a page waiting to be
       filled in. */
    if (!list) {
      tabHost.replaceChildren();
      tableHost.replaceChildren(el('div', { class: 'wl-blank' }, [
        el('h2', { text: 'No watchlists yet' }),
        el('p', { text: 'A watchlist is a list of companies you choose, priced together and gradeable in the same table the screener uses. Press “New list” above to start one.' }),
      ]));
      return;
    }
    if (!list.symbols.length) {
      tabHost.replaceChildren();
      tableHost.replaceChildren(el('div', { class: 'wl-blank' }, [
        el('h2', { text: `${list.name} is empty` }),
        el('p', { text: 'Add a symbol above — a ticker as FMP spells it, like AAPL, or MC.PA for a listing outside the US.' }),
      ]));
      return;
    }
    if (status.state !== 'ok') {
      tabHost.replaceChildren();
      tableHost.replaceChildren(emptyState(status.state === 'empty' ? 'ok' : status.state,
        status.message || (status.state === 'skipped' ? 'Quotes come from FMP. Add your API key in Settings.' : '')));
      return;
    }
    tabHost.replaceChildren(tabs(sets));
    const save = () => writeStore(store);
    tableHost.replaceChildren(
      // Free, so it leads: the day's move arrived with the prices, in the one
      // request that built the list.
      moversBlock(list, rows, (symbol) => nav.goSymbol?.(symbol)),
      healthBlock(list, rows, stats),
      el('p', { class: 'mh-section-description', text: 'Your own list, in the screener’s table. Overview is one request for the whole list; every other tab is per company and says so before it loads. Vanlior Quant is this report’s composite on the reduced set — a handful of ratios per factor against the company’s own sector distribution, not the full report grade.' }),
      // `onFill` because the health score above is computed from the same
      // three bags the Overview tab buys: without it the card would still say
      // "nothing is scored yet" over a table that had just filled with scores.
      marketTable({ rows, sets, state, showTabs: false, identity, onFill: draw,
        emptyText: 'Nothing in this list matches that.' }),

      /* Below the table, in the order the questions get more expensive:
         allocation and dividends ride on the profile and ratios the Overview
         tab already bought, the calendar and the purification block each buy
         two more feeds per company and say so first. */
      allocationBlock(list, rows, save, (symbol) => nav.goSymbol?.(symbol), draw),
      dividendsBlock(list, rows, (symbol) => nav.goSymbol?.(symbol)),
      calendarBlock(list, rows, (symbol) => nav.goSymbol?.(symbol), draw),

      purificationBlock(list, rows, save, (symbol) => nav.goSymbol?.(symbol),
        () => nav.goView?.('shariah', 'screener')),
    );
  }

  draw();
  load();
  // The distributions ship with the app, so this is a file read rather than a
  // request; the score column is blank until it lands and redraws.
  loadSectorStats().then((loaded) => { if (disposed) return; stats = loaded; draw(); }).catch(() => { /* graded columns stay blank */ });
  return page;
}
