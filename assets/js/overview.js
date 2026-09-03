/* ==========================================================================
   Maz Vantage — the Overview tab

   The short version of the report: what the company is, what it costs, what
   the five factors say, and the handful of numbers a reader wants before
   deciding whether to open the Analysis tab at all.

   Almost everything here is a second view of figures `analyse()` has already
   derived — the one exception is the Shariah screen, which has no home
   anywhere else in the model.

   Two entry points, because the design puts the company head *above* the tab
   strip and the cards below it:

     renderOverviewHead(a, nav)       identity, price, key numbers, score card
     renderOverviewTab(a, ctx, nav)   the card grid

   `nav.openAnalysis(anchor)` switches to the Analysis tab and lands on that
   factor, so every "view details" on this page goes somewhere real.
   ========================================================================== */

import {
  el, isNum, money, num, pct, mult, price, trim, dec, fmtDate, ago,
  signClass, clamp, titleCase,
} from './util.js';
import { lineChart } from './charts.js';
import { card, notice, feedGate, icon, curSymbol } from './ui.js';
import { normalisePrices } from './model.js';
import { logoUrl } from './fmp.js';
import { FACTOR_BY_KEY, FACTOR_KEYS } from './factors.js';
import { MAX_SCORE, letterFor, toneForLetter, histogramRank, rankLabel } from './grading.js';
import { gradePill } from './gradeview.js';

/* ==========================================================================
   Shared helpers
   ========================================================================== */

/**
 * Score -> verdict word.
 *
 * The same five bands the Analysis tab's score distribution is labelled with,
 * read off the same 0-MAX_SCORE scale, so the word here and the band the
 * marker sits in over there can never disagree.
 */
const VERDICT_BANDS = ['Strong sell', 'Sell', 'Hold', 'Buy', 'Strong buy'];

function verdictWord(score) {
  if (!isNum(score)) return null;
  return VERDICT_BANDS[clamp(Math.floor(score), 0, VERDICT_BANDS.length - 1)];
}

function verdictTone(score) {
  if (!isNum(score)) return 'muted';
  if (score >= 3) return 'good';
  if (score >= 2) return 'warn';
  return 'bad';
}

/**
 * Grade -> a word for the grade.
 *
 * Not the verdict words above: "Hold" is a position to take on a company,
 * and saying it about a factor would claim something the factor never said.
 * These describe the letter, and come off the same five tone buckets the
 * grade pills and bars are coloured from.
 */
const GRADE_WORDS = {
  strong: 'Strong', good: 'Good', mid: 'Middling', weak: 'Weak', poor: 'Poor', na: 'Not graded',
};

function gradeWord(score, letter) {
  return GRADE_WORDS[toneForLetter(letter ?? letterFor(score))] || 'Not graded';
}

/** Where the overall grade falls in the sector, or null when nothing is loaded. */
function sectorRank(a) {
  const r = histogramRank(a.scores.overall?.score, a.sectorTable.overall);
  return r ? { ...r, label: rankLabel(r.pctile) } : null;
}

/** One graded metric out of the factor tree, by id. */
function metricOf(a, factorKey, id) {
  for (const g of a.scores[factorKey]?.groups || []) {
    const m = g.metrics.find((x) => x.id === id);
    if (m) return m;
  }
  return null;
}

/** Label / value line. The workhorse of every small card on this page. */
function statLine(label, value, { tone = '', note = '', title = '' } = {}) {
  return el('div', { class: 'ostat', title: title || null }, [
    el('span', { class: 'ostat__k', text: label }),
    el('span', { class: 'ostat__v' }, [
      value instanceof Node ? value : el('span', { class: tone, text: String(value ?? 'n/a') }),
      note ? el('i', { class: 'ostat__note', text: note }) : null,
    ]),
  ]);
}

/** A 0-MAX_SCORE bar, coloured by the same grade tones the report uses. */
function scoreTrack(score, letter) {
  const w = isNum(score) ? clamp((score / MAX_SCORE) * 100, 0, 100) : 0;
  return el('span', { class: 'otrack' }, [
    el('span', {
      class: `otrack__fill is-${toneForLetter(letter ?? letterFor(score))}`,
      style: { width: `${w}%` },
    }),
  ]);
}

/**
 * Card head: title on the left, whatever the card wants on the right.
 *
 * `info` is the small print — what a figure is measured against, what the
 * card deliberately does not claim. It hangs off an icon beside the title
 * rather than sitting under the card as a grey paragraph: on a dashboard
 * every one of those competes with the numbers it qualifies, and there are a
 * dozen cards. The sentence is still there, on hover and to a screen reader.
 */
function ohead(title, aside, info) {
  return el('div', { class: 'ocard__head' }, [
    el('h2', {}, [
      title,
      info ? icon('info', 'ocard__info', info) : null,
    ]),
    aside || null,
  ]);
}

/** A button that reads as a link out of a card, into the full report. */
function moreLink(text, onClick) {
  return el('button', { type: 'button', class: 'omore', text, onclick: onClick });
}

/* ---------- miniature charts ---------------------------------------------
   charts.js draws into a 760-wide viewBox, which is right for a full-width
   block and wrong inside a 280px card: the whole drawing scales down with its
   container, taking the 11px axis labels to about 4px with it. These two draw
   into a box the size of the card they live in, so the type stays at the size
   it was set at.
   ------------------------------------------------------------------------- */

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    n.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

/**
 * Grouped columns, one group per category.
 *
 * Values may be negative — a loss-making year is a fact about the company,
 * not a data error — so the baseline is wherever zero falls rather than the
 * bottom of the plot.
 */
function miniColumns(categories, series, { w = 320, h = 176, fmt = (v) => money(v) } = {}) {
  const live = series.filter((s) => s.values.some(isNum));
  if (!categories.length || !live.length) return notice('No annual statements to chart.');

  const pad = { t: 8, r: 2, b: 18, l: 56 };
  const x0 = pad.l, x1 = w - pad.r, y0 = h - pad.b, y1 = pad.t;
  const all = live.flatMap((s) => s.values).filter(isNum);
  const hi = Math.max(0, ...all), lo = Math.min(0, ...all);
  const sy = (v) => y0 - ((v - lo) / ((hi - lo) || 1)) * (y0 - y1);

  const g = svgEl('g');
  for (const t of [hi, lo + (hi - lo) / 2, lo]) {
    const y = sy(t);
    g.append(svgEl('line', { x1: x0, x2: x1, y1: y, y2: y, class: 'ochart__grid' }));
    g.append(svgEl('text', { x: x0 - 6, y: y + 3.5, 'text-anchor': 'end', 'font-size': 9.5 }, fmt(t)));
  }

  const band = (x1 - x0) / categories.length;
  const barW = Math.max(2, (band * 0.72) / live.length);
  categories.forEach((c, i) => {
    const left = x0 + band * i + (band - barW * live.length) / 2;
    live.forEach((s, k) => {
      const v = s.values[i];
      if (!isNum(v)) return;
      const y = sy(v), zero = sy(0);
      g.append(svgEl('rect', {
        x: (left + barW * k).toFixed(2), y: Math.min(y, zero).toFixed(2),
        width: barW.toFixed(2), height: Math.max(1, Math.abs(zero - y)).toFixed(2),
        fill: s.color, rx: 1.5,
      }, [svgEl('title', {}, `${s.name} ${c}: ${fmt(v)}`)]));
    });
    g.append(svgEl('text', {
      x: (x0 + band * (i + 0.5)).toFixed(2), y: h - 5,
      'text-anchor': 'middle', 'font-size': 9.5,
    }, c));
  });

  const box = svgEl('svg', {
    class: 'ochart', viewBox: `0 0 ${w} ${h}`, role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
    'aria-label': `${live.map((s) => s.name).join(', ')} by fiscal year`,
  }, [g]);

  return el('div', {}, [box, el('div', { class: 'olegend' }, live.map((s) =>
    el('span', {}, [el('i', { style: { background: s.color } }), s.name])))]);
}

/** A single row of bars — enough for a dividend-per-share history. */
function miniBars(rows, { w = 240, h = 76, color = 'var(--brand-01)', fmt = (v) => dec(v, 2) } = {}) {
  const live = rows.filter((r) => isNum(r.value));
  if (live.length < 2) return null;

  const pad = { t: 6, b: 14 };
  const hi = Math.max(...live.map((r) => r.value));
  const band = w / live.length;
  const barW = Math.max(3, band * 0.6);

  const g = svgEl('g');
  live.forEach((r, i) => {
    const bh = Math.max(2, (r.value / (hi || 1)) * (h - pad.t - pad.b));
    g.append(svgEl('rect', {
      x: (band * i + (band - barW) / 2).toFixed(2), y: (h - pad.b - bh).toFixed(2),
      width: barW.toFixed(2), height: bh.toFixed(2), fill: color, rx: 1.5,
    }, [svgEl('title', {}, `${r.label}: ${fmt(r.value)}`)]));
    // Only the ends are labelled: a 240px box cannot carry eight years of
    // four-digit labels without them colliding.
    if (i === 0 || i === live.length - 1) {
      g.append(svgEl('text', {
        x: (band * (i + 0.5)).toFixed(2), y: h - 3,
        'text-anchor': i === 0 ? 'start' : 'end', 'font-size': 9.5,
      }, r.label));
    }
  });

  return svgEl('svg', {
    class: 'ochart', viewBox: `0 0 ${w} ${h}`, role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
    'aria-label': 'Dividend per share by year',
  }, [g]);
}

/* ==========================================================================
   The head — above the tab strip

   Identity, price and the score card. It sits above the tabs because it is
   true of the company rather than of a tab, which is the same reason the
   compact price head it stands in for sits there on the Analysis tab.
   ========================================================================== */

export function renderOverviewHead(a, nav = {}) {
  const f = a.facts;
  const cur = curSymbol(f.currency);

  const up = isNum(f.change) && f.change > 0;
  const flat = !isNum(f.change) || f.change === 0;
  const changeText = isNum(f.change)
    ? `${up ? '+' : ''}${dec(f.change, 2)} (${pct(f.changePct ?? 0, { sign: true })})`
    : '';

  const badges = [
    a.execs.capBand ? titleCase(a.execs.capBand.label.replace('-', ' ')) : null,
    f.sector || null,
  ].filter(Boolean);

  return el('div', { class: 'ohead' }, [
    el('div', { class: 'crumbs' }, [
      el('span', { text: 'Home' }),
      el('span', { text: 'Stocks' }),
      el('span', { text: f.symbol }),
    ]),

    el('div', { class: 'ohead__grid' }, [
      el('div', { class: 'ohead__main' }, [
        el('div', { class: 'ohead__id' }, [
          f.image
            ? el('img', {
                class: 'ohead__logo', src: f.image, alt: '', loading: 'lazy',
                onerror: (e) => e.target.remove(),
              })
            : null,
          el('div', { style: { minWidth: '0' } }, [
            el('h1', { class: 'ohead__name', text: f.name }),
            el('div', { class: 'ohead__meta' }, [
              el('b', { text: f.symbol }),
              el('span', { text: f.exchange || f.exchangeFull || '' }),
              ...badges.map((b) => el('span', { class: 'obadge', text: b })),
            ]),
          ]),
        ]),
        f.description ? el('p', { class: 'ohead__desc', text: f.description }) : null,
        el('div', { class: 'ohead__actions' }, [
          el('button', {
            class: 'btn btn--primary', text: 'Full analysis',
            onclick: () => nav.openAnalysis?.(),
          }),
          el('button', {
            class: 'btn', text: 'Compare peers',
            onclick: () => document.getElementById('ovw-peers')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
          }),
        ]),
      ]),

      el('div', { class: 'ohead__quote' }, [
        el('div', { class: 'ohead__pricerow' }, [
          el('span', { class: 'ohead__price', text: price(f.price, cur) }),
          changeText
            ? el('span', {
                class: `ohead__change ${flat ? '' : up ? 'is-up' : 'is-down'}`.trim(),
                text: changeText,
              })
            : null,
        ]),
        el('p', {
          class: 'ohead__asof',
          text: f.quoteTime
            ? `Last trade ${fmtDate(f.quoteTime, { day: 'numeric', month: 'short', year: 'numeric' })}`
            : `Data ${ago(a.ds.asOf) || 'as loaded'}`,
        }),

        el('div', { class: 'ohead__stats' }, [
          statLine('Market cap', money(f.marketCap)),
          statLine('P/E ratio (TTM)', mult(f.pe)),
          statLine('52W range', isNum(f.yearLow) && isNum(f.yearHigh)
            ? `${trim(f.yearLow, 0)}–${trim(f.yearHigh, 0)}` : 'n/a'),
          statLine('Dividend yield', pct(f.dividendYield, { dp: 2 })),
          statLine('Volume', isNum(f.volume) ? num(f.volume, 1) : 'n/a'),
          statLine('Beta', dec(f.beta, 2)),
        ]),
      ]),

      mazScoreCard(a, nav),
    ]),
  ]);
}

/**
 * The score card.
 *
 * Prints on the report's own 0-MAX_SCORE scale rather than converting to a
 * ten-point one: the letter grades, the factor bars and the sector
 * distribution on the Analysis tab are all calibrated to this scale, and a
 * second denominator for the same number is a bug the reader has to catch.
 */
function mazScoreCard(a, nav = {}) {
  const overall = a.scores.overall || {};
  const word = verdictWord(overall.score);
  const rank = sectorRank(a);
  const shariah = SHARIAH_STANDARDS.map((std) => shariahVerdict(a, std));
  const shPassed = shariah.filter((r) => r.state === 'pass').length;
  const shFailed = shariah.filter((r) => r.state === 'fail').length;

  return el('aside', { class: 'mazscore' }, [
    el('div', { class: 'mazscore__top' }, [
      el('span', { class: 'mazscore__label' }, [
        'Maz score',
        icon('info', 'mazscore__info',
          'The mean of the five factor grades, each of them a percentile against the '
          + `${a.facts.sector || 'wider'} sector, on a scale of 0 to ${MAX_SCORE}.`),
      ]),
      el('div', { class: 'mazscore__value' }, [
        el('b', { text: isNum(overall.score) ? dec(overall.score, 2) : '—' }),
        el('i', { text: `/${MAX_SCORE}` }),
      ]),
      word ? el('p', { class: `mazscore__verdict is-${verdictTone(overall.score)}`, text: word }) : null,
    ]),

    el('div', { class: 'mazscore__rows' }, FACTOR_KEYS.map((k) => {
      const s = a.scores[k];
      return el('button', {
        type: 'button', class: 'mazscore__row',
        onclick: () => nav.openAnalysis?.(FACTOR_BY_KEY[k].anchor),
        title: `Open the ${s.title} section`,
      }, [
        el('span', { class: 'mazscore__name', text: s.title }),
        scoreTrack(s.score, s.letter),
        el('span', { class: 'mazscore__num', text: isNum(s.score) ? dec(s.score, 1) : '—' }),
      ]);
    })),

    el('div', { class: 'mazscore__foot' }, [
      el('div', { class: 'mazscore__footrow' }, [
        // The count, not a verdict: the five standards can disagree, so a
        // single pass/fail here would be true of some of them and not others.
        el('span', { text: 'Shariah screens' }),
        el('span', {
          class: `pill pill--${shFailed ? 'bad' : shPassed ? 'good' : 'muted'}`,
          text: `${shPassed} of ${shariah.length} pass`,
        }),
      ]),
      el('div', { class: 'mazscore__footrow' }, [
        el('span', { text: `vs ${a.facts.sector || 'sector'}` }),
        el('b', { text: rank?.label?.text || 'not ranked' }),
      ]),
    ]),
  ]);
}

/* ==========================================================================
   The tab — the card grid
   ========================================================================== */

export function renderOverviewTab(a, ctx = {}, nav = {}) {
  return el('div', { class: 'ovw' }, [
    pricePerformanceCard(a, ctx),
    keyStatisticsCard(a),
    // Directly under the price chart: what the bulls and bears are arguing
    // about is the line above it.
    bullBearCard(a),
    insiderCard(a, nav),
    valuationCard(a, nav),
    performanceCard(a),
    healthCard(a, nav),
    factorCard(a, nav),
    shariahCard(a),
    dividendCard(a, nav),
    peerCard(a, nav),
  ]);
}

/* ---------- 1. price performance ------------------------------------------ */

const RANGES = [
  { key: '1M', days: 30 }, { key: '3M', days: 92 }, { key: '6M', days: 183 },
  { key: '1Y', days: 365 }, { key: '3Y', days: 1095 }, { key: '5Y', days: 1825 },
  { key: 'MAX', days: Infinity },
];

/** Total return across whatever slice of a series is on screen. */
function windowReturn(pts) {
  if (pts.length < 2) return null;
  const first = pts[0].price, last = pts.at(-1).price;
  return isNum(first) && isNum(last) && first > 0 ? last / first - 1 : null;
}

function pricePerformanceCard(a, ctx) {
  const f = a.facts;
  const prices = normalisePrices(a.ds.get('prices'));
  const industry = normalisePrices(ctx?.benchmarks?.industry);
  const market = normalisePrices(ctx?.benchmarks?.market);

  const host = el('div', {});
  const legend = el('div', { class: 'oreturns' });
  const sel = el('div', { class: 'rangesel' });
  let active = '1Y';

  const slice = (pts, days) => {
    const cutoff = Date.now() - days * 864e5;
    return pts.filter((p) => days === Infinity || new Date(p.date).getTime() >= cutoff);
  };

  const draw = () => {
    const days = RANGES.find((r) => r.key === active).days;
    const pts = slice(prices, days);

    host.replaceChildren(pts.length > 1
      ? lineChart(pts.map((p) => ({ date: p.date, value: p.price })), {
          height: 240,
          valueFmt: (v) => price(v, curSymbol(f.currency)),
          labelFmt: (d) => fmtDate(d, { month: 'short', year: '2-digit' }),
        })
      : (feedGate(a, 'prices', 'Price history') || notice('No price history for this range.')));

    // The reference design overlays three price lines. These are printed as
    // three returns instead: the benchmarks are ETF price series with their
    // own levels, and putting them on one axis would compare a $300 share
    // with a $250 ETF rather than comparing how far each of them moved.
    legend.replaceChildren(...[
      { name: f.symbol, value: windowReturn(pts), self: true },
      { name: f.sector || 'Sector', value: windowReturn(slice(industry, days)) },
      { name: 'Market', value: windowReturn(slice(market, days)) },
    ].map((r) => el('span', { class: `oreturns__item ${r.self ? 'is-self' : ''}`.trim() }, [
      el('i', { text: r.name }),
      el('b', { class: signClass(r.value), text: isNum(r.value) ? pct(r.value, { sign: true }) : 'n/a' }),
    ])));

    [...sel.children].forEach((b) => b.classList.toggle('is-on', b.textContent === active));
  };

  RANGES.forEach((r) => {
    const b = el('button', { type: 'button', text: r.key });
    b.addEventListener('click', () => { active = r.key; draw(); });
    sel.append(b);
  });
  draw();   // paint the default range before the card is attached

  return card('ovw-price', [
    ohead('Price performance', sel, ctx?.benchmarks?.note
      || 'Returns are the move across the selected window, close to close.'),
    host,
    legend,
  ], 'ocard ovw__c8');
}

/* ---------- 2. key statistics --------------------------------------------- */

function keyStatisticsCard(a) {
  const f = a.facts;
  const cur = curSymbol(f.currency);

  return card('ovw-stats', [
    ohead('Key statistics'),
    el('div', { class: 'ostats' }, [
      statLine('Open', price(f.open, cur)),
      statLine('Day high', price(f.dayHigh, cur)),
      statLine('Day low', price(f.dayLow, cur)),
      statLine('Previous close', price(f.previousClose, cur)),
    ]),
    el('div', { class: 'ostats ostats--split' }, [
      statLine('Market cap', money(f.marketCap)),
      statLine('Enterprise value', money(a.val.ev)),
      statLine('Shares outstanding', isNum(f.shares) ? num(f.shares, 2) : 'n/a'),
      statLine('Revenue (TTM)', money(f.revenue)),
      statLine('Earnings (TTM)', money(f.netIncome)),
      statLine('EPS (TTM)', isNum(f.eps) ? dec(f.eps, 2) : 'n/a'),
      statLine('Employees', isNum(f.employees) ? f.employees.toLocaleString('en-US') : 'n/a'),
      statLine('Beta (5Y)', dec(f.beta, 2)),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- 3. valuation --------------------------------------------------- */

/** A multiple, with the grade the report already gave it. */
function multipleRow(a, id, label, fmt = mult) {
  const m = metricOf(a, 'valuation', id);
  return el('div', {
    class: 'ostat',
    title: m?.rank?.text ? `${label}: ${m.rank.text} of the sector` : label,
  }, [
    el('span', { class: 'ostat__k', text: label }),
    el('span', { class: 'ostat__v' }, [
      el('span', { class: 'ostat__fig', text: m && isNum(m.value) ? fmt(m.value) : 'n/a' }),
      m ? gradePill(m.grade, m.letter) : null,
    ]),
  ]);
}

function valuationCard(a, nav) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const disc = a.discount;

  const headline = isNum(a.fairValue)
    ? el('div', { class: 'obig' }, [
        el('span', { class: 'obig__k', text: 'Fair value (vendor DCF)' }),
        el('span', { class: 'obig__v', text: price(a.fairValue, cur) }),
        isNum(disc)
          ? el('span', {
              class: `obig__note ${disc > 0 ? 'pos' : 'neg'}`,
              text: `${pct(Math.abs(disc))} ${disc > 0 ? 'undervalued' : 'overvalued'}`,
            })
          : null,
      ])
    : (feedGate(a, 'dcfLevered', 'Discounted cash flow') || notice('No fair value available.'));

  return card('ovw-valuation', [
    ohead('Valuation', null, 'Fair value is shown but never graded - a model is a set of '
      + 'assumptions the reader picks. The multiples under it are graded against the sector.'),
    headline,
    el('div', { class: 'ostats' }, [
      multipleRow(a, 'peGaapTtm', 'P/E (TTM)'),
      multipleRow(a, 'pegGaap', 'PEG'),
      multipleRow(a, 'evToEbitdaTtm', 'EV/EBITDA'),
      multipleRow(a, 'priceToSalesTtm', 'P/S'),
      multipleRow(a, 'priceToBookTtm', 'P/B'),
    ]),
    moreLink('View full valuation', () => nav.openAnalysis?.('valuation')),
  ], 'ocard ovw__c4');
}

/* ---------- 4. financial performance --------------------------------------- */

function performanceCard(a) {
  const f = a.facts;
  const inc = f.statements.income.slice(-5);
  const cash = f.statements.cash;
  const yearOfRow = (r) => String(r.fiscalYear ?? new Date(r.date).getUTCFullYear());
  const years = inc.map(yearOfRow);
  const fcfBy = new Map(cash.map((r) => [yearOfRow(r), r.freeCashFlow]));

  const chart = inc.length
    ? miniColumns(years, [
        { name: 'Revenue', color: 'var(--chart-01)', values: inc.map((r) => r.revenue ?? null) },
        { name: 'Net income', color: 'var(--good)', values: inc.map((r) => r.netIncome ?? null) },
        { name: 'Free cash flow', color: 'var(--brand-01)', values: years.map((y) => fcfBy.get(y) ?? null) },
      ], { fmt: (v) => money(v, { dp: 0 }) })
    : (feedGate(a, 'income', 'Annual statements') || notice('No annual statements available.'));

  const line = (label, value, growth) => statLine(label, el('span', {}, [
    el('span', { class: 'ostat__fig', text: money(value) }),
    el('span', {
      class: `ostat__delta ${signClass(growth)}`,
      text: isNum(growth) ? pct(growth, { sign: true }) : '',
    }),
  ]));

  return card('ovw-performance', [
    ohead('Financial performance', el('span', { class: 'pill pill--muted', text: 'Annual' }),
      'Bars are filed fiscal years. The three figures under them are trailing twelve month, '
      + 'against the prior year.'),
    chart,
    el('div', { class: 'ostats ostats--split' }, [
      line('Revenue (TTM)', f.revenue, a.growth.revenueYoy),
      line('Net income (TTM)', f.netIncome, a.growth.netIncome),
      line('Free cash flow (TTM)', f.fcf, a.growth.fcf),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- 5. financial health -------------------------------------------- */

function healthRow(a, id, label, fmt) {
  const m = metricOf(a, 'health', id);
  return el('div', {
    class: 'ostat',
    title: m?.rank?.text ? `${label}: ${m.rank.text} of the sector` : label,
  }, [
    el('span', { class: 'ostat__k', text: label }),
    el('span', { class: 'ostat__v' }, [
      el('span', { class: 'ostat__fig', text: m && isNum(m.value) ? fmt(m.value) : 'n/a' }),
      m ? gradePill(m.grade, m.letter) : null,
    ]),
  ]);
}

function healthCard(a, nav) {
  const s = a.scores.health;

  return card('ovw-health', [
    ohead('Financial health'),
    el('div', { class: 'ostats' }, [
      healthRow(a, 'debtToEquity', 'Debt / equity', (v) => pct(v)),
      healthRow(a, 'currentRatio', 'Current ratio', (v) => dec(v, 2)),
      healthRow(a, 'interestCoverage', 'Interest coverage', (v) => mult(v)),
      healthRow(a, 'fcfToDebt', 'Free cash flow / debt', (v) => dec(v, 2)),
      healthRow(a, 'altmanZScore', 'Altman Z-score', (v) => dec(v, 2)),
    ]),
    el('div', { class: 'ograde' }, [
      el('span', { class: 'ograde__word', text: gradeWord(s.score, s.letter) }),
      scoreTrack(s.score, s.letter),
      gradePill(s.score, s.letter),
    ]),
    moreLink('View details', () => nav.openAnalysis?.('financial-health')),
  ], 'ocard ovw__c4');
}

/* ---------- 6. factor tiles ------------------------------------------------ */

/**
 * The five factors as tiles.
 *
 * The reference design puts a sparkline under each score. There is no history
 * of factor grades to draw — the report grades one moment — so each tile
 * carries what *is* measured instead: the bar, the letter, where the grade
 * ranks on the scale, and how much of the factor could be assessed at all.
 */
function factorCard(a, nav) {
  return card('ovw-factors', [
    ohead('Maz factor analysis', null,
      'Each factor is the mean of its ratios, every one of them ranked against the '
      + `${a.facts.sector || 'wider'} sector.`),
    el('div', { class: 'ofactors' }, FACTOR_KEYS.map((k) => {
      const s = a.scores[k];
      return el('button', {
        type: 'button', class: 'ofactor',
        onclick: () => nav.openAnalysis?.(FACTOR_BY_KEY[k].anchor),
      }, [
        el('span', { class: 'ofactor__t', text: s.title }),
        el('span', { class: 'ofactor__v' }, [
          el('b', { text: isNum(s.score) ? dec(s.score, 2) : '—' }),
          gradePill(s.score, s.letter),
        ]),
        scoreTrack(s.score, s.letter),
        el('span', { class: 'ofactor__r', text: gradeWord(s.score, s.letter) }),
        el('span', { class: 'ofactor__n', text: `${s.graded} of ${s.total} ratios graded` }),
      ]);
    })),
  ], 'ocard ovw__c12');
}

/* ---------- 7. Shariah screen ----------------------------------------------
   Five index methodologies, one line each.

   They ask the same balance-sheet questions and disagree only on what they
   divide by and where they cut, so a company can clear one and fail another
   on identical financials — which is the whole reason for listing five
   rather than picking one.

   A row reads "Pass" when every test this app can compute clears that
   standard's limits. It is not a certification: the non-compliant-income and
   receivables tests need fields outside the feed picks in fmp.js, and the
   index providers screen against an averaged market cap where this has only
   the current one. The card's tooltip says both.
   ------------------------------------------------------------------------- */

/** Industry and sector wordings a business-activity screen excludes outright. */
const EXCLUDED = [
  'bank', 'insurance', 'capital markets', 'credit services', 'mortgage',
  'financial data', 'asset management', 'gambling', 'casino', 'tobacco',
  'brewer', 'distiller', 'winerie', 'alcoholic',
];

/**
 * The five published screens, as data. `divisor` is the only structural
 * difference: AAOIFI and the two S&P Dow Jones families measure against
 * market capitalisation, FTSE and MSCI against total assets.
 */
const SHARIAH_STANDARDS = [
  { key: 'aaoifi', name: 'AAOIFI',     divisor: 'marketCap', debt: 0.30,   liquid: 0.30 },
  { key: 'sp',     name: 'S&P Global', divisor: 'marketCap', debt: 0.33,   liquid: 0.33 },
  { key: 'djim',   name: 'Dow Jones',  divisor: 'marketCap', debt: 0.33,   liquid: 0.33 },
  { key: 'ftse',   name: 'FTSE',       divisor: 'assets',    debt: 0.33,   liquid: 0.33 },
  { key: 'msci',   name: 'MSCI',       divisor: 'assets',    debt: 0.3333, liquid: 0.3333 },
];

const SHARIAH_INFO = 'A mechanical screen, not a scholarly ruling. AAOIFI, S&P Global and Dow '
  + 'Jones measure debt and cash against market capitalisation; FTSE and MSCI against total '
  + 'assets, which is why the same company can pass one and fail another. Two further tests — '
  + 'non-compliant income and receivables — need fields outside the feeds loaded here and are '
  + 'not run, and the index providers screen on an averaged market cap (Dow Jones 24 months, '
  + 'S&P 36) where this card has only the current one. Verify against the provider before '
  + 'relying on it.';

/** Is the business itself excluded, regardless of the balance sheet? */
function excludedActivity(f) {
  const hay = `${f.industry || ''} ${f.sector || ''}`.toLowerCase();
  return EXCLUDED.find((w) => hay.includes(w)) || null;
}

/** One standard's verdict: 'pass', 'fail', or 'na' when nothing can be measured. */
function shariahVerdict(a, std) {
  const f = a.facts;
  const base = std.divisor === 'assets' ? f.totalAssets : f.marketCap;

  if (excludedActivity(f)) return { std, state: 'fail', note: 'Excluded business activity' };
  if (!isNum(base) || base <= 0 || !isNum(f.totalDebt) || !isNum(f.cash)) {
    return { std, state: 'na', note: 'Not enough of the balance sheet is loaded' };
  }

  const debt = f.totalDebt / base;
  const liquid = f.cash / base;
  const basis = std.divisor === 'assets' ? 'assets' : 'market cap';
  const pass = debt <= std.debt && liquid <= std.liquid;

  return {
    std,
    state: pass ? 'pass' : 'fail',
    note: `Debt ${pct(debt)} \u00b7 cash ${pct(liquid)} of ${basis}`,
  };
}

function shariahCard(a) {
  const rows = SHARIAH_STANDARDS.map((std) => shariahVerdict(a, std));
  const passed = rows.filter((r) => r.state === 'pass').length;
  const failed = rows.filter((r) => r.state === 'fail').length;

  return card('ovw-shariah', [
    ohead('Shariah screen', el('span', {
      class: `pill pill--${failed ? 'bad' : passed ? 'good' : 'muted'}`,
      text: `${passed} of ${rows.length} pass`,
    }), SHARIAH_INFO),

    el('ul', { class: 'ostds' }, rows.map((r) => el('li', { class: 'ostd', title: r.note }, [
      icon(r.state, `check__icon ${r.state}`),
      el('span', { class: 'ostd__n', text: r.std.name }),
      el('span', { class: `ostd__v is-${r.state}`,
        text: r.state === 'pass' ? 'Pass' : r.state === 'fail' ? 'Fail' : 'n/a' }),
    ]))),
  ], 'ocard ovw__c4');
}

/* ---------- 8. dividends ---------------------------------------------------- */

function dividendCard(a, nav) {
  const f = a.facts, d = a.dividends;
  const cur = curSymbol(f.currency);
  const pays = isNum(f.dividendYield) && f.dividendYield > 0;

  // Cover, not generosity: the question a safety chip answers is whether the
  // cash the payout needs is actually there, which is the cash payout ratio.
  const safety = !pays ? null
    : !isNum(f.cashPayoutRatio) ? { text: 'Not measured', tone: 'muted' }
    : f.cashPayoutRatio <= 0.6 ? { text: 'Covered', tone: 'good' }
    : f.cashPayoutRatio <= 0.9 ? { text: 'Tight', tone: 'neutral' }
    : { text: 'Stretched', tone: 'bad' };

  return card('ovw-dividend', [
    ohead('Dividends', safety ? el('span', { class: `pill pill--${safety.tone}`, text: safety.text }) : null),
    pays
      ? el('div', {}, [
          el('div', { class: 'ostats' }, [
            statLine('Yield (TTM)', pct(f.dividendYield, { dp: 2 })),
            statLine('Per share', isNum(f.dividendPerShare) ? price(f.dividendPerShare, cur) : 'n/a'),
            statLine('Payout ratio', pct(f.payoutRatio, { dp: 0 })),
            statLine('Cash payout ratio', pct(f.cashPayoutRatio, { dp: 0 })),
            statLine('Growth p.a.', pct(d.growth, { dp: 1 })),
            statLine('Years of history', d.years ? String(d.years) : 'n/a'),
          ]),
          d.byYear.length > 1
            ? el('div', { class: 'mt2' }, [
                miniBars(d.byYear.map((r) => ({ label: String(r.year), value: r.amount }))),
              ])
            : null,
        ])
      : notice(`${f.symbol} does not currently pay a dividend.`),
    moreLink('View dividend history', () => nav.openAnalysis?.('dividend')),
  ], 'ocard ovw__c4');
}

/* ---------- 9. peers -------------------------------------------------------- */

/**
 * A peer's mark, as a round tile.
 *
 * The vendor's logo endpoint has no entry for every listed company, and a
 * broken image in a table reads as a broken table — so a 404 swaps itself for
 * the initial rather than leaving a gap, and every row keeps the same
 * left edge whether the image resolved or not.
 */
function peerLogo(symbol, src) {
  const initial = () => el('span', { class: 'opeer__logo opeer__logo--fb', text: (symbol || '?')[0] });
  if (!src) return initial();
  const img = el('img', { class: 'opeer__logo', src, alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(initial()));
  return img;
}

function peerCard(a, nav) {
  const rows = [...a.peers.peers]
    .concat([{
      symbol: a.facts.symbol, pe: a.facts.pe, image: a.facts.image || logoUrl(a.facts.symbol),
      self: true, score: a.peers.self?.score ?? null,
    }])
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));

  const body = rows.length > 1
    ? el('table', { class: 'tbl otbl' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Company' }),
          el('th', { class: 'num', text: 'Score' }),
          el('th', { class: 'num', text: 'P/E' }),
        ])]),
        el('tbody', {}, rows.map((p) => el('tr', { class: p.self ? 'is-self' : '' }, [
          el('td', {}, [el('span', { class: 'opeer' }, [
            peerLogo(p.symbol, p.image),
            p.self
              ? el('b', { text: p.symbol })
              : el('a', { href: `?symbol=${encodeURIComponent(p.symbol)}`, text: p.symbol }),
          ])]),
          el('td', { class: 'num', text: isNum(p.score) ? dec(p.score, 2) : '—' }),
          el('td', { class: 'num', text: isNum(p.pe) ? mult(p.pe) : 'n/a' }),
        ]))),
      ])
    : (feedGate(a, 'peers', 'Competitors') || notice('No peer list available.'));

  return card('ovw-peers', [
    ohead('Peer comparison', null, 'Everyone here is scored on the ratios all of them share, '
      + 'which is far short of the full model - read it as a sort order.'),
    body,
    moreLink('Full ranking', () => nav.openAnalysis?.('ratings')),
  ], 'ocard ovw__c4');
}

/* ---------- 11. bulls & bears ------------------------------------------------
   The case for and against, from the last quarter and the last three months.

   Deliberately not the reward/risk lists the Analysis tab carries: those are
   drawn from the whole graded ratio set and read as paragraphs. This is what
   changed recently — the quarter against what the street expected, the price
   since, where the analysts stand, what insiders did — in one line each, with
   the headlines under it so the reader can see what the coverage is actually
   about rather than being told a sentiment nobody computed.
   --------------------------------------------------------------------------- */

const BULLBEAR_INFO = 'The last reported quarter against consensus, the last three months of '
  + 'price action, and the analyst and insider positions. Headlines are listed, not read: '
  + 'nothing here scores their sentiment.';

/**
 * One short line per recent fact, sorted onto the side it argues for.
 *
 * Order is recency, not weight: the quarter first, then the price, then the
 * standing positions. Each line is a fragment rather than a sentence — the
 * column heading already says who is talking.
 */
function recentPoints(a) {
  const f = a.facts, q = a.quarter, m = a.momentum, ins = a.insiders;
  const bulls = [], bears = [];
  const put = (good, text) => (good ? bulls : bears).push(text);

  if (isNum(q.epsSurprise)) {
    put(q.epsSurprise >= 0, `EPS ${q.epsSurprise >= 0 ? 'beat' : 'missed'} consensus by `
      + pct(Math.abs(q.epsSurprise)));
  }
  if (isNum(q.revenueSurprise)) {
    put(q.revenueSurprise >= 0, `Revenue ${q.revenueSurprise >= 0 ? 'beat' : 'missed'} by `
      + pct(Math.abs(q.revenueSurprise)));
  }
  if (isNum(m.r3m)) {
    put(m.r3m >= 0, `${m.r3m >= 0 ? 'Up' : 'Down'} ${pct(Math.abs(m.r3m))} over three months`);
  }
  if (isNum(m.excessSector)) {
    put(m.excessSector >= 0, `${m.excessSector >= 0 ? 'Ahead of' : 'Behind'} the sector by `
      + `${trim(Math.abs(m.excessSector) * 100, 1)} points this year`);
  }
  if (isNum(m.targetUpside)) {
    put(m.targetUpside >= 0, `Analyst target ${pct(Math.abs(m.targetUpside))} `
      + `${m.targetUpside >= 0 ? 'above' : 'below'} the price`);
  }
  if (isNum(a.discount)) {
    put(a.discount >= 0, `${pct(Math.abs(a.discount))} ${a.discount >= 0 ? 'under' : 'over'} DCF fair value`);
  }
  if (ins.available && ins.net !== 0) {
    put(ins.net > 0, `Insiders net ${ins.net > 0 ? 'buyers' : 'sellers'} of `
      + `${num(Math.abs(ins.net), 1)} shares`);
  }
  if (isNum(a.growth.revenueYoy)) {
    put(a.growth.revenueYoy >= 0, `Revenue ${a.growth.revenueYoy >= 0 ? 'grew' : 'fell'} `
      + `${pct(Math.abs(a.growth.revenueYoy))} last year`);
  }
  if (isNum(a.growth.fcf)) {
    put(a.growth.fcf >= 0, `Free cash flow ${a.growth.fcf >= 0 ? 'up' : 'down'} `
      + `${pct(Math.abs(a.growth.fcf))} last year`);
  }

  // Valuation carries its sector rank rather than a bare multiple: "35.3x"
  // argues nothing on its own.
  const pe = metricOf(a, 'valuation', 'peGaapTtm');
  if (pe && isNum(pe.value) && pe.rank) {
    put(pe.rank.side === 'top', `${mult(pe.value)} earnings \u2014 ${pe.rank.text} of the sector`);
  }

  return { bulls: bulls.slice(0, 5), bears: bears.slice(0, 5) };
}

function bullBearCard(a) {
  const { bulls, bears } = recentPoints(a);
  const news = a.ds.get('news');
  const q = a.quarter;

  const side = (title, items, kind, empty) => el('div', { class: `rr rr--${kind}` }, [
    el('h3', { text: title }),
    items.length
      ? el('ul', {}, items.map((t) => el('li', {}, [el('span', { text: t })])))
      : el('p', { class: 'rr__empty', text: empty }),
  ]);

  return card('ovw-bullbear', [
    ohead('Bulls vs bears', q.date
      ? el('span', { class: 'pill pill--muted', text: `Results ${fmtDate(q.date)}` })
      : null, BULLBEAR_INFO),

    el('div', { class: 'rrgrid' }, [
      side('Bulls say', bulls, 'reward', 'Nothing in the recent numbers argues for it.'),
      side('Bears say', bears, 'risk', 'Nothing in the recent numbers argues against it.'),
    ]),

    Array.isArray(news) && news.length ? el('p', { class: 'osub', text: 'In the news' }) : null,
    Array.isArray(news) && news.length
      ? el('ul', { class: 'onews' }, news.slice(0, 4).map((n) => el('li', {}, [
          el('a', {
            class: 'onews__t', href: n.url || '#', target: '_blank', rel: 'noopener noreferrer',
            text: n.title || 'Untitled',
          }),
          el('span', {
            class: 'onews__m',
            text: `${n.publisher || n.site || 'News'} \u00b7 `
              + `${ago(n.publishedDate || n.date) || fmtDate(n.publishedDate || n.date)}`,
          }),
        ])))
      : (feedGate(a, 'news', 'Recent news') || null),
  ], 'ocard ovw__c8');
}

/* ---------- 12. insider dealing ---------------------------------------------- */

/**
 * Who inside the company has been buying, and who has been selling.
 *
 * The headline is the four-quarter net from `deriveInsiders`, not the latest
 * quarter: one vesting event in an otherwise quiet quarter would otherwise
 * read as a verdict. `insiderLine` carries the caveat that goes with a net
 * disposal, and is the same sentence the Ownership section prints.
 */
function insiderCard(a, nav) {
  const ins = a.insiders;

  if (!ins.available) {
    return card('ovw-insiders', [
      ohead('Insider trading'),
      feedGate(a, 'insiderStats', 'Insider trading') || notice('No insider statistics reported.'),
    ], 'ocard ovw__c4');
  }

  const buying = ins.net >= 0;
  const badge = el('span', {
    class: `pill ${buying ? 'pill--good' : 'pill--neutral'}`,
    text: buying ? 'Net buyers' : 'Net sellers',
  });

  const trades = ins.trades.slice(0, 4).map((t) => {
    // `acquisitionOrDisposition` is the reliable direction flag; the
    // transaction code ("S-Sale", "P-Purchase") is only the label.
    const acquired = (t.acquisitionOrDisposition || '').toUpperCase() === 'A';
    return el('li', { class: 'otrade' }, [
      el('span', { class: 'otrade__d' }, [
        el('b', { text: t.reportingName || 'Unnamed filer' }),
        el('i', { text: [
          (t.typeOfOwner || '').replace(/^officer:\s*/i, ''),
          fmtDate(t.transactionDate || t.filingDate),
        ].filter(Boolean).join(' · ') }),
      ]),
      el('span', { class: 'otrade__v' }, [
        el('span', {
          class: `pill ${acquired ? 'pill--good' : 'pill--bad'}`,
          text: (t.transactionType || (acquired ? 'Acquired' : 'Disposed')).replace(/^[A-Z]-/, ''),
        }),
        el('b', { text: isNum(t.securitiesTransacted) ? t.securitiesTransacted.toLocaleString('en-US') : 'n/a' }),
      ]),
    ]);
  });

  return card('ovw-insiders', [
    ohead('Insider trading', badge, ins.note),

    el('div', { class: 'obig' }, [
      el('span', { class: 'obig__k', text: `Net shares, ${ins.quarters === 4 ? 'last four quarters' : ins.span}` }),
      el('span', { class: `obig__v ${buying ? 'pos' : 'neg'}`,
        text: `${buying ? '+' : ''}${ins.net.toLocaleString('en-US')}` }),
      el('span', { class: 'obig__note softer', text: ins.span }),
    ]),

    el('div', { class: 'ostats' }, [
      statLine('Shares acquired', ins.acquired.toLocaleString('en-US')),
      statLine('Shares disposed', ins.disposed.toLocaleString('en-US')),
      statLine('Acquired / disposed', isNum(ins.ratio) ? dec(ins.ratio, 2) : 'n/a'),
    ]),

    trades.length ? el('p', { class: 'osub', text: 'Recent filings' }) : null,
    trades.length
      ? el('ul', { class: 'otrades' }, trades)
      : notice('No individual Form 4 filings were returned for this ticker.'),

    moreLink('View ownership', () => nav.openAnalysis?.('ownership')),
  ], 'ocard ovw__c4');
}
