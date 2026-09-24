/* The market canvas's shared parts: the formatters, the instrument mark, the
   rails and the dialog. Two pages draw on them — the Market Data hub and the
   Market Indices board — so they live here rather than inside either one.
   Nothing in this file fetches; every value arrives from the data adapter. */
import { el, isNum } from './util.js';
import { logoUrl } from './fmp.js';
import { DEFAULT_COUNTRY } from './markethub-data.js';

const COUNTRY_KEY = 'mazvantage.market.country';

/* ---------- flags ----------------------------------------------------------

   These were regional-indicator emoji, which is the right way to write a flag
   and the wrong way to show one: **Windows ships no country-flag glyphs**, so
   every picker, release row and tab rendered the bare letter pair the emoji is
   built from. `US`, `FR`, `DE` down the menu, which is what the country code
   badge beside it already said.

   So a flag is an image, from a flag CDN — the same shape as the company logos
   in `fmp.js`: an external asset that may not resolve, with the letters kept
   as the fallback. A machine with no network is therefore no worse off than it
   was, and everyone else sees a flag.

   The vendor spells a country two ways on the calendar feed and one of them is
   not an ISO code, which is the difference between a flag and a blank. */
const COUNTRY_ALIAS = { USA: 'US', UK: 'GB', EL: 'GR', UAE: 'AE' };
const flagUrl = (iso) => `https://flagcdn.com/${iso.toLowerCase()}.svg`;
export function countryFlag(code, { large = false, className = '' } = {}) {
  const raw = String(code ?? '').trim().toUpperCase();
  const iso = COUNTRY_ALIAS[raw] || raw;
  const node = el('span', { class: `mh-flag${large ? ' mh-flag--large' : ''}${className ? ` ${className}` : ''}`, 'aria-hidden': 'true' });
  if (!/^[A-Z]{2}$/.test(iso)) {
    if (raw) node.append(el('span', { class: 'mh-flag__code', text: raw.slice(0, 3) }));
    return node;
  }
  const image = el('img', { class: 'mh-flag__img', src: flagUrl(iso), alt: '', loading: 'lazy', decoding: 'async' });
  image.addEventListener('error', () => {
    image.remove();
    node.append(el('span', { class: 'mh-flag__code', text: iso }));
  }, { once: true });
  node.append(image);
  return node;
}

/** The country a visit opens on: the one in the link, else the last one chosen
 *  here, else the United States. Neither store is required to be readable. */
export function storedCountry() {
  try {
    const asked = new URLSearchParams(location.search).get('country');
    if (asked) return asked;
  } catch { /* no query string to read */ }
  try { return localStorage.getItem(COUNTRY_KEY) || DEFAULT_COUNTRY; } catch { return DEFAULT_COUNTRY; }
}
/** Keep the choice across visits, and put it in the URL so a link carries it. */
export function rememberCountry(code) {
  try { localStorage.setItem(COUNTRY_KEY, code); } catch { /* storage unavailable */ }
  try {
    const url = new URL(location.href);
    url.searchParams.set('country', code);
    history.replaceState(history.state, '', url);
  } catch { /* history unavailable */ }
}
export const shortNumber = value => !isNum(value) ? '—' : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
export const number = (value, dp = 2) => !isNum(value) ? '—' : value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const percent = value => !isNum(value) ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value))}%`;
export const changeOf = row => row.changesPercentage ?? row.changePercentage;
export const signed = value => el('span', { class: `mh-change ${value > 0 ? 'mh-up' : value < 0 ? 'mh-down' : ''}`, text: percent(value) });
export const arrow = () => el('span', { class: 'mh-chevron', 'aria-hidden': 'true', text: '›' });

export function instrumentMark(row, large = false) {
  const kind = row.kind || row.meta?.kind;
  const stock = !kind || ['stock', 'equity', 'etf'].includes(kind);
  const symbol = String(row.symbol || '');
  const mark = row.mark || row.meta?.mark || (kind === 'crypto' ? ({BTCUSD:'₿', ETHUSD:'Ξ', SOLUSD:'◎', XRPUSD:'X'}[symbol]) : null)
    || symbol.replace(/^\^/, '').replace(/USD$/, '').slice(0, 3);
  const node = el('span', { class: `mh-mark${large ? ' mh-mark--large' : ''}`, 'aria-hidden': 'true',
    style: { '--mark-color': row.color || row.meta?.color || '#4169b3' } }, [el('span', { text: mark })]);
  if (stock && symbol) {
    const img = el('img', { src: logoUrl(symbol), alt: '', loading: 'lazy', decoding: 'async', onerror: () => img.remove() });
    node.append(img);
  }
  return node;
}

export function priceText(row) {
  const currency = row.currency || row.meta?.currency || '';
  const precision = row.kind === 'forex' ? 4 : isNum(row.price) && row.price > 0 && row.price < 1 ? 5 : 2;
  return el('span', { class: 'mh-price' }, [number(row.price, precision), el('small', { text: currency })]);
}

export function heading(title, onClick, level = 'h3') {
  return el(level, { class: `mh-heading ${level === 'h2' ? 'mh-heading--section' : ''}` }, [
    onClick ? el('button', { type: 'button', onclick: onClick }, [title, arrow()]) : title,
  ]);
}

export function emptyState(status, message, compact = false) {
  const title = status === 'loading' ? 'Loading market data' : status === 'skipped' ? 'Connect FMP to see market data'
    : status === 'gated' ? 'Not available on this FMP plan' : status === 'unavailable' ? 'Not supplied by FMP'
      : status === 'error' ? 'Data could not be loaded' : 'No results available';
  return el('div', { class: `mh-empty${compact ? ' mh-empty--compact' : ''}`, role: 'status' }, [
    el('span', { class: 'mh-empty__icon', 'aria-hidden': 'true', text: status === 'loading' ? '◌' : '↗' }),
    el('strong', { text: title }),
    message && el('p', { text: message }),
  ]);
}

// Horizontal rails keep the same click targets on touch, trackpad and keyboard.
export function carousel(items, { label, className = '', step = 0.85 } = {}) {
  const track = el('div', { class: `mh-rail ${className}`, tabindex: '0', 'aria-label': label }, items);
  const previous = el('button', { type: 'button', class: 'mh-rail__arrow mh-rail__arrow--prev', 'aria-label': `Previous ${label}`,
    text: '‹', onclick: () => track.scrollBy({ left: -track.clientWidth * step, behavior: 'smooth' }) });
  const next = el('button', { type: 'button', class: 'mh-rail__arrow', 'aria-label': `Next ${label}`,
    text: '›', onclick: () => track.scrollBy({ left: track.clientWidth * step, behavior: 'smooth' }) });
  const sync = () => {
    previous.hidden = track.scrollLeft < 4;
    next.hidden = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  };
  track.addEventListener('scroll', sync, { passive: true });
  track.addEventListener('keydown', event => {
    if (event.target !== track || !['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    track.scrollBy({ left: track.clientWidth * (event.key === 'ArrowRight' ? step : -step), behavior: 'smooth' });
  });
  const node = el('div', { class: 'mh-carousel' }, [track, previous, next]);
  const resize = new ResizeObserver(sync);
  resize.observe(track);
  node.dispose = () => resize.disconnect();
  previous.hidden = true;
  next.hidden = true;
  return node;
}

/** A publishing time as a reader says it, not as a clock does. */
export function when(value) {
  const at = value ? new Date(String(value).replace(' ', 'T')) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  const hours = Math.floor((Date.now() - at.getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* One story, wherever it is listed. The marks are what the story named — an
   index on the indices board, a contract on futures, a fund on the ETF page —
   and the headline is the publisher's own words, opening on their own site. */
export function newsCard(item) {
  return el('article', { class: 'mi-news' }, [
    el('div', { class: 'mi-news__meta' }, [
      item.indices?.length ? el('span', { class: 'mi-news__marks' }, item.indices.map(row => instrumentMark(row))) : null,
      el('span', { text: when(item.date) }),
      item.source ? el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }) : null,
      item.source ? el('span', { class: 'mi-news__source', text: item.source }) : null,
    ].filter(Boolean)),
    item.url
      ? el('a', { class: 'mi-news__title', href: item.url, target: '_blank', rel: 'noopener noreferrer', text: item.title })
      : el('p', { class: 'mi-news__title', text: item.title }),
  ]);
}

/**
 * One story, the way both the news stream and the front page print it: the
 * publisher and the hour, the headline, the vendor's own summary, the symbols
 * the story was filed under, and the publisher's picture.
 *
 * Two pages draw it, so it lives here rather than in either of them.
 */
export function storyRow(item, { nav = {}, lead = false, quotes = null } = {}) {
  const headline = item.url
    ? el('a', { class: 'nw-story__t', href: item.url, target: '_blank', rel: 'noopener noreferrer', text: item.title })
    : el('span', { class: 'nw-story__t', text: item.title });
  const body = el('div', { class: 'nw-story__body' }, [
    el('div', { class: 'nw-story__meta' }, [
      el('span', { class: 'nw-story__src', text: item.source || 'Unattributed' }),
      el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
      el('time', { datetime: item.date || null, text: when(item.date) }),
    ]),
    headline,
    item.text ? el('p', { class: 'nw-story__x', text: item.text }) : null,
    storyMarks(item, quotes, nav, 4),
  ].filter(Boolean));
  const article = el('article', { class: `nw-story${lead ? ' nw-story--lead' : ''}` }, [body]);
  if (item.image) {
    const image = el('img', { src: item.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    // A dead image leaves a grey box in a column of a dozen; remove the frame.
    const frame = el('div', { class: 'nw-story__thumb' }, [image]);
    image.addEventListener('error', () => frame.remove(), { once: true });
    article.append(frame);
  }
  return article;
}

/* The named symbol under a story row. Same bargain as the chip: the wire
   supplies the tag, and the quote is one batch call the row does not wait for.
   `data-symbol` is what `paintQuotes` finds it by afterwards. */
function storyTick(mark, quotes, nav) {
  const symbol = String(mark.symbol || '').toUpperCase();
  const quote = quotes?.get(symbol);
  return el('button', {
    type: 'button', class: 'nw-tick', 'data-symbol': symbol,
    'aria-label': `Open ${mark.symbol}`, onclick: () => nav.goSymbol?.(mark.symbol),
  }, [
    instrumentMark(mark),
    el('span', { class: 'nw-tick__n', text: mark.shortName || mark.symbol }),
    quote ? signed(changeOf(quote)) : null,
  ].filter(Boolean));
}

/**
 * Fill in what the tagged symbols did, for rows already on screen.
 *
 * The quote for a story's symbol is a batch call that lands after the row is
 * drawn, and a list that paginates cannot be thrown away and rebuilt to carry
 * it. So the tick is drawn with a slot and this fills it: one pass over the
 * ticks under `root`, skipping any that already carry a change.
 */
export function paintQuotes(root, quotes) {
  if (!root || !quotes?.size) return;
  for (const tick of root.querySelectorAll('.nw-tick[data-symbol]')) {
    if (tick.querySelector('.mh-change')) continue;
    const quote = quotes.get(tick.dataset.symbol);
    const change = quote ? changeOf(quote) : null;
    if (isNum(change)) tick.append(signed(change));
  }
}

function storyMeta(item, quotes, nav) {
  return el('div', { class: 'nw-story__meta' }, [
    el('span', { class: 'nw-story__src', text: item.source || 'Unattributed' }),
    el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
    el('time', { datetime: item.date || null, text: when(item.date) }),
  ]);
}

/**
 * The symbols a story was filed under, as their own row under the meta.
 *
 * One tick shape across the whole wire — the block at the top of a page and
 * the rows under it — so a reader learns it once. It sits outside the meta
 * line because that line is baseline-aligned 11px text and a pill is neither.
 * `limit` is the only thing that differs: a lead card has room for the symbols
 * it was filed under, a brief beside it has room for one.
 */
function storyMarks(item, quotes, nav, limit = 1) {
  if (!item.marks?.length) return null;
  return el('div', { class: 'nw-story__marks' },
    item.marks.slice(0, limit).map((mark) => storyTick(mark, quotes, nav)));
}

function storyLink(item, className) {
  return item.url
    ? el('a', { class: className, href: item.url, target: '_blank', rel: 'noopener noreferrer', text: item.title })
    : el('span', { class: className, text: item.title });
}

function storyPicture(item, className) {
  if (!item.image) return null;
  const image = el('img', { src: item.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  const frame = el('div', { class: className }, [image]);
  image.addEventListener('error', () => frame.remove(), { once: true });
  return frame;
}

/**
 * The block a news page leads with: one story given the room to be read, the
 * next few as cards under it, and the rest as headlines down one side.
 *
 * `below` is how many cards sit under the lead and `aside` how many headlines
 * stand beside it — the front page takes three and four, a category strip
 * takes none and three. `quotes` is the map from `quoteMap()`, and without it
 * the chips simply carry no change.
 */
export function featuredNews(stories, { nav = {}, below = 3, aside = 4, quotes = null } = {}) {
  const items = (stories || []).filter(Boolean);
  if (!items.length) return null;
  // The lead is the first story with a picture: this layout is built around
  // one, and a lead without it is a headline in a very large font.
  const lead = items.find((item) => item.image) || items[0];
  const rest = items.filter((item) => item !== lead);
  const cards = rest.slice(0, below);
  const briefs = rest.slice(below, below + aside);
  return el('div', { class: `nf${briefs.length ? '' : ' nf--solo'}` }, [
    el('div', { class: 'nf__main' }, [
      el('article', { class: 'nf__lead' }, [
        storyPicture(lead, 'nf__lead-thumb'),
        el('div', { class: 'nf__lead-body' }, [
          storyLink(lead, 'nf__lead-title'),
          lead.text ? el('p', { class: 'nf__lead-text', text: lead.text }) : null,
          storyMeta(lead, quotes, nav),
          storyMarks(lead, quotes, nav, 2),
        ].filter(Boolean)),
      ].filter(Boolean)),
      cards.length ? el('div', { class: 'nf__row' }, cards.map((item) => el('article', { class: 'nf__card' }, [
        storyPicture(item, 'nf__card-thumb'),
        el('div', { class: 'nf__card-body' }, [storyLink(item, 'nf__card-title'),
          storyMeta(item, quotes, nav), storyMarks(item, quotes, nav)].filter(Boolean)),
      ].filter(Boolean)))) : null,
    ].filter(Boolean)),
    briefs.length ? el('div', { class: 'nf__aside' }, briefs.map((item) => el('article', { class: 'nf__brief' }, [
      storyLink(item, 'nf__brief-title'), storyMeta(item, quotes, nav), storyMarks(item, quotes, nav),
    ].filter(Boolean)))) : null,
  ].filter(Boolean));
}

export function createDialog(title, build, onClose) {
  const close = () => dialog.close();
  const dialog = el('dialog', { class: 'mh-dialog', 'aria-label': title }, [
    el('div', { class: 'mh-dialog__head' }, [el('h2', { text: title }), el('button', {
      type: 'button', class: 'mh-icon-button', 'aria-label': 'Close', text: '✕', onclick: close,
    })]),
  ]);
  dialog.append(build(dialog));
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  } });
  dialog.addEventListener('close', () => { onClose?.(); dialog.remove(); }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

export function metricValue(row, spec) {
  const key = spec.metricKey;
  const value = key ? row[key] : null;
  if (!key) return null;
  if (/yield|rangePct/i.test(key)) return isNum(value) ? `${number(value)}%` : '—';
  if (/change|return|yield|volatility|growth|Pct/i.test(key)) return percent(value);
  if (/date/i.test(key)) return value || '—';
  return shortNumber(value);
}

export function quoteRow(row, spec, onPick) {
  const metric = spec.metricKey && spec.metricKey !== 'changesPercentage';
  return el('button', { type: 'button', class: `mh-row${metric ? ' mh-row--metric' : ''}`, onclick: () => onPick(row),
    title: `${row.name || row.symbol} · ${row.symbol}` }, [
    el('span', { class: 'mh-row__identity' }, [instrumentMark(row), el('span', { class: 'mh-row__name' }, [
      el('strong', { text: row.name || row.symbol }), el('small', { text: row.symbol || '' }),
    ])]),
    el('span', { class: 'mh-row__quote' }, [priceText(row), signed(changeOf(row))]),
    metric && el('span', { class: 'mh-row__metric', text: metricValue(row, spec) }),
  ]);
}
