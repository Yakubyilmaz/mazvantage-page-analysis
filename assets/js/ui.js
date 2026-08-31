/* ==========================================================================
   Maz Vantage — shared UI building blocks

   The primitives every section is assembled from: cards, blocks, notices,
   tables, comparison bars and the feed-gate message. Kept in their own module
   so both the narrative sections and the graded factor views can use them
   without importing each other.
   ========================================================================== */

import { el, esc, isNum, money, num, pct, mult, price, trim, dec, clamp } from './util.js';

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
/** Currency code -> the symbol to print in front of a price. */
export function curSymbol(code) {
  return ({ USD: 'US$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'AU$', CHF: 'CHF ', INR: '₹' })[code] || `${code} `;
}
