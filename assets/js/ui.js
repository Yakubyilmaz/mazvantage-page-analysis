/* ==========================================================================
   Maz Vantage — shared UI building blocks

   The primitives every section is assembled from: cards, blocks, notices,
   tables, comparison bars and the feed-gate message. Kept in their own module
   so both the narrative sections and the graded factor views can use them
   without importing each other.
   ========================================================================== */

import { el, esc, isNum, money, num, pct, mult, price, trim, dec, cagr, clamp } from './util.js';

/* ==========================================================================
   Shared building blocks
   ========================================================================== */

const ICON = {
  pass: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12ZM5.70711 13.7071L9.29289 17.2929C9.68342 17.6834 10.3166 17.6834 10.7071 17.2929L18.2929 9.70711C18.6834 9.31658 18.6834 8.68342 18.2929 8.29289L17.7071 7.70711C17.3166 7.31658 16.6834 7.31658 16.2929 7.70711L10 14L7.70711 11.7071C7.31658 11.3166 6.68342 11.3166 6.29289 11.7071L5.70711 12.2929C5.31658 12.6834 5.31658 13.3166 5.70711 13.7071Z',
  fail: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12ZM12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L6.70711 7.29289C6.31658 7.68342 6.31658 8.31658 6.70711 8.70711L10 12L6.70711 15.2929C6.31658 15.6834 6.31658 16.3166 6.70711 16.7071L7.29289 17.2929C7.68342 17.6834 8.31658 17.6834 8.70711 17.2929L12 14L15.2929 17.2929C15.6834 17.6834 16.3166 17.6834 16.7071 17.2929L17.2929 16.7071C17.6834 16.3166 17.6834 15.6834 17.2929 15.2929L14 12L17.2929 8.70711C17.6834 8.31658 17.6834 7.68342 17.2929 7.29289L16.7071 6.70711C16.3166 6.31658 15.6834 6.31658 15.2929 6.70711L12 10Z',
  na: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12ZM7 11H17C17.5523 11 18 11.4477 18 12V12C18 12.5523 17.5523 13 17 13H7C6.44772 13 6 12.5523 6 12V12C6 11.4477 6.44772 11 7 11Z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
};

export function icon(kind, cls = '', title = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  if (title) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title);
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = title;
    svg.append(t);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON[kind] || ICON.info);
  path.setAttribute('fill-rule', 'evenodd');
  svg.append(path);
  return svg;
}

export function card(id, children, cls = '') {
  return el('section', { class: `card sec ${cls}`.trim(), id }, children);
}

export function blockEl(title, desc, body, aside) {
  return el('div', { class: 'block' }, [
    el('div', { class: 'block__head' }, [
      el('div', {}, [
        el('h3', { class: 'block__title', text: title }),
        desc ? el('p', { class: 'block__desc', text: desc }) : null,
      ]),
      aside || null,
    ]),
    el('div', { class: 'block__body' }, body),
  ]);
}

export function notice(text, kind = '') {
  return el('div', { class: `notice ${kind}`.trim() }, [icon('info'), el('div', { html: text })]);
}

/** The 0-6 score header plus its check list. */
/** One pass/fail/na line with its label and note. Used by the debt panel. */
export function checkRow(c) {
  return el('li', { class: 'check', 'data-check': c.id }, [
    icon(c.state, `check__icon ${c.state}`),
    el('div', {}, [
      el('p', { class: 'check__label', text: c.label }),
      c.note ? el('p', { class: 'check__note', text: c.note }) : null,
      c.state === 'na' && c.why ? el('p', { class: 'check__note subtle', text: c.why }) : null,
    ]),
  ]);
}

/**
 * Label / value line. The workhorse of every small card on a dashboard tab.
 *
 * `note` is the qualifier that belongs to the figure rather than to the row —
 * the period it covers, what it excludes — and prints small beside it.
 */
export function statLine(label, value, { tone = '', note = '', title = '' } = {}) {
  return el('div', { class: 'ostat', title: title || null }, [
    el('span', { class: 'ostat__k', text: label }),
    el('span', { class: 'ostat__v' }, [
      value instanceof Node ? value : el('span', { class: tone, text: String(value ?? 'n/a') }),
      note ? el('i', { class: 'ostat__note', text: note }) : null,
    ]),
  ]);
}

/**
 * Card head: title on the left, whatever the card wants on the right.
 *
 * `info` is the small print — what a figure is measured against, what the card
 * deliberately does not claim. It hangs off an icon beside the title rather
 * than sitting under the card as a grey paragraph: on a grid of a dozen cards
 * every one of those competes with the numbers it qualifies. The sentence is
 * still there, on hover and to a screen reader.
 */
export function ohead(title, aside, info) {
  return el('div', { class: 'ocard__head' }, [
    el('h2', {}, [
      title,
      info ? icon('info', 'ocard__info', info) : null,
    ]),
    aside || null,
  ]);
}

export function keyInfo(items) {
  return el('div', { class: 'keyinfo' }, items
    .filter(Boolean)
    .map(([k, v]) => el('div', { class: 'keyinfo__cell' }, [
      el('div', { class: 'keyinfo__v', text: v }),
      el('div', { class: 'keyinfo__k', text: k }),
    ])));
}

/** Horizontal comparison bars sharing one scale. */
export function cmpBars(rows, { fmt = (v) => mult(v) } = {}) {
  const vals = rows.map((r) => r.value).filter(isNum);
  const max = vals.length ? Math.max(...vals) : 1;
  return el('div', { class: 'cmp' }, rows.map((r) => {
    const w = isNum(r.value) && max > 0 ? clamp((r.value / max) * 100, 1.5, 100) : 0;
    return el('div', { class: `cmp__row ${r.self ? 'is-self' : ''}`.trim() }, [
      el('div', { class: 'cmp__label', title: r.label, text: r.label }),
      el('div', { class: 'cmp__track' }, [
        el('div', {
          class: `cmp__fill ${r.self ? 'is-self' : ''} ${r.tone ? 'is-' + r.tone : ''}`.trim(),
          style: { width: `${w}%` },
        }),
      ]),
      el('div', { class: 'cmp__val', text: isNum(r.value) ? fmt(r.value) : 'n/a' }),
    ]);
  }));
}

export function table(headers, rows) {
  return el('div', { class: 'tbl-wrap' }, [
    el('table', { class: 'tbl' }, [
      el('thead', {}, [el('tr', {}, headers.map((h) =>
        el('th', { class: h.num ? 'num' : '', text: h.label ?? h })))]),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) =>
        el('td', { class: headers[i]?.num ? 'num' : '' }, [c instanceof Node ? c : String(c ?? 'n/a')]))))),
    ]),
  ]);
}

/** Renders the gated/unavailable message for a feed, or null when it is fine. */
export function feedGate(a, feed, what) {
  const s = a.ds.status(feed);
  if (s === 'ok') return null;
  if (s === 'gated') {
    return notice(`<b>${esc(what)}</b> is not included in your current FMP plan. `
      + `The rest of the report is unaffected — upgrade the plan behind your API key to fill this in.`);
  }
  if (s === 'skipped') {
    return notice(`<b>${esc(what)}</b> needs a live FMP connection. Add your API key in <code>Settings</code> to load it.`);
  }
  return notice(`<b>${esc(what)}</b> could not be loaded — ${esc(a.ds.message(feed) || 'unknown error')}.`, 'notice--error');
}
/**
 * The two numbers that summarise a run of bars: what it did in total, and
 * what that is a year.
 *
 * Under a chart rather than in its title, because they are a reading of the
 * chart rather than a label for it — and together, because either alone
 * misleads. A total of 4,060% says nothing about how long it took; a
 * compound rate says nothing about whether the run was steady or one year
 * doing all the work, which the bars above are there to show.
 *
 * Both are null-safe and both refuse a sign flip: a series that starts
 * negative has no compound rate, and printing one would be arithmetic
 * pretending to be a fact about the company.
 */
export function perfCagr(first, last, years, {
  fmt = (v) => pct(v, { sign: true }),
  /* Pass `invert` for a series whose welcome direction is down — a share
     count, a debt pile. The sign printed is still the sign; only the colour
     turns over, because "fewer shares" is a fall and a gain at once and the
     number has to stay honest about which of those it is measuring. */
  invert = false,
} = {}) {
  const total = isNum(first) && isNum(last) && first > 0 ? last / first - 1 : null;
  const rate = cagr(first, last, years);
  if (!isNum(total) && !isNum(rate)) return null;

  const good = (v) => (invert ? v < 0 : v > 0);
  const pill = (label, v, title) => el('span', {
    class: `perfpill ${isNum(v) && !good(v) ? 'is-down' : 'is-up'}`,
    title: title || null,
  }, [
    el('i', { text: label }),
    el('b', { text: isNum(v) ? fmt(v) : 'n/a' }),
  ]);

  return el('div', { class: 'perfrow' }, [
    pill('Perf', total, `The whole span, start to finish, over ${years} year${years === 1 ? '' : 's'}.`),
    pill('CAGR', rate, 'The constant annual rate that would have produced the same finish. '
      + 'Not shown where the series starts at or below zero, which has no compound rate.'),
  ]);
}

/**
 * An asset's logo, with a letter behind it.
 *
 * The vendor serves these from its own image host and has one for most listed
 * companies and funds — but not for every one, and not for an index, which is
 * not a company at all. A broken image icon in a row of tiles is worse than no
 * image, so a failed load swaps itself for the first letter of the symbol on a
 * neutral square and the row keeps its rhythm.
 *
 * Takes a URL rather than a symbol, so this file goes on depending only on
 * `util.js` — `logoUrl()` lives in `fmp.js` and the caller pairs them.
 *
 * `fallback: 'none'` drops the tile entirely when the vendor has no image,
 * which is what a ticker chip wants: the chip already prints the symbol, so a
 * letter square beside it repeats the first character and nothing else. Tiles
 * and rows keep the default, where the square is what holds the rhythm.
 */
export function logo(url, label = '', { size = '', fallback = 'letter' } = {}) {
  const cls = `alogo ${size ? `alogo--${size}` : ''}`.trim();
  const blank = () => (fallback === 'none' ? null : el('span', {
    class: `${cls} alogo--fb`, 'aria-hidden': 'true',
    text: String(label || '?').replace(/[^A-Za-z0-9]/g, '')[0]?.toUpperCase() || '?',
  }));
  if (!url) return blank();

  const img = el('img', { class: cls, src: url, alt: '', loading: 'lazy' });
  img.addEventListener('error', () => {
    const replacement = blank();
    if (replacement) img.replaceWith(replacement); else img.remove();
  });
  return img;
}

/* ==========================================================================
   Heatmap
   ========================================================================== */

/**
 * A grid of tiles coloured by how far each moved.
 *
 * Two surfaces read this — Markets Data's equity page and the sector
 * breakdown — so it lives here rather than in either of them. It takes an
 * `onPick` callback instead of a `nav` object, which keeps this file's
 * dependency list at `util.js` and means a caller decides what a tile click
 * means.
 *
 * ---------------------------------------------------------------------------
 * Why the buckets are fixed and not relative
 * ---------------------------------------------------------------------------
 *
 * The obvious implementation scales colour to the biggest move on screen. It
 * is also the wrong one: on a flat day the best sector at +0.2% would render
 * as deep green, and the page would look like a rally. Fixed thresholds mean a
 * quiet day *looks* quiet, which is the only honest behaviour for a display
 * whose whole job is to be read at a glance.
 *
 * Five steps either side of zero, at 0.5 / 1 / 2 / 3 per cent.
 */
const HEAT_STEPS = [0.5, 1, 2, 3];

export function heatTone(change) {
  if (!isNum(change)) return 'na';
  const a = Math.abs(change);
  let step = 0;
  for (const t of HEAT_STEPS) if (a >= t) step += 1;
  if (step === 0) return 'flat';
  return `${change >= 0 ? 'up' : 'down'}-${step}`;
}

/**
 * `rows` is `[{ label, change, note? }]`, `change` already in per cent.
 *
 * `onPick(row)` makes a tile a button; without it the tiles are plain spans,
 * because a tile that looks clickable and is not is worse than one that
 * plainly is not.
 */
export function heatmap(rows, { onPick = null, title = (r) => r.label } = {}) {
  return el('div', { class: 'heat' }, rows.map((r) => {
    const kids = [
      el('span', { class: 'heat__k', text: r.label }),
      el('span', { class: 'heat__v', text: isNum(r.change) ? pct(r.change, { already: true, sign: true }) : 'n/a' }),
      r.note ? el('i', { class: 'heat__n', text: r.note }) : null,
    ];
    const cls = `heat__t is-${heatTone(r.change)}`;

    return onPick
      ? el('button', { type: 'button', class: cls, title: title(r), onclick: () => onPick(r) }, kids)
      : el('div', { class: cls, title: title(r) }, kids);
  }));
}

/** The legend that says what the colours mean, since the scale is fixed. */
export function heatLegend() {
  const swatch = (tone, label) => el('span', { class: 'heatleg__i' }, [
    el('i', { class: `heatleg__s is-${tone}` }),
    el('span', { text: label }),
  ]);
  return el('div', { class: 'heatleg' }, [
    swatch('down-4', '−3%'),
    swatch('down-2', '−1%'),
    swatch('flat', '0'),
    swatch('up-2', '+1%'),
    swatch('up-4', '+3%'),
    el('span', { class: 'heatleg__n', text: 'fixed scale, so a quiet day looks quiet' }),
  ]);
}

/** Currency code -> the symbol to print in front of a price. */
export function curSymbol(code) {
  return ({ USD: 'US$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'AU$', CHF: 'CHF ', INR: '₹' })[code] || `${code} `;
}
