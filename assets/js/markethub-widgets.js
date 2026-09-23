/* Small, source-driven widgets for the Markets overview. */
import { el } from './util.js';
import { logoUrl } from './fmp.js';
import { countryFlag } from './markethub-ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DASH = '—';

function number(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function display(value, { decimals = 2, fixed = false, compact = false } = {}) {
  if (value == null || value === '') return DASH;
  const numeric = number(value);
  if (numeric == null) return String(value);
  return numeric.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: fixed ? decimals : 0,
    ...(compact && Math.abs(numeric) >= 1e6 ? { notation: 'compact' } : {}),
  });
}

function first(row, keys) {
  return keys.map(key => row?.[key]).find(value => value != null && value !== '') ?? null;
}

function dateLabel(value, options = {}) {
  if (!value) return DASH;
  const dateOnly = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const date = new Date(dateOnly ? `${dateOnly}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC', ...options,
  });
}

function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function arrow(direction) {
  return svg('svg', { viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true' }, [
    svg('path', {
      d: direction === 'left' ? 'M12 4 6 10l6 6' : 'm8 4 6 6-6 6', fill: 'none',
      stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }),
  ]);
}

function empty(message) {
  return el('div', { class: 'mhw-empty', role: 'status' }, [
    el('span', { class: 'mhw-empty__mark', 'aria-hidden': 'true', text: DASH }),
    el('p', { text: message }),
  ]);
}

function metric(label, value) {
  return el('div', { class: 'mhw-calendar__metric' }, [
    el('dt', { text: label }), el('dd', { text: value }),
  ]);
}

function companyMark(row) {
  // Initials also cover companies whose listing does not have a provider logo.
  const symbol = String(first(row, ['symbol', 'ticker']) || '');
  const name = String(first(row, ['name', 'company', 'companyName']) || symbol || '?');
  const letters = (symbol || name).replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();
  const mark = el('span', { class: 'mhw-company-mark', 'aria-hidden': 'true', text: letters });
  const source = row.image || (symbol ? logoUrl(symbol) : null);
  if (source) {
    const image = el('img', { src: source, alt: '', loading: 'lazy', decoding: 'async' });
    image.addEventListener('error', () => image.remove(), { once: true });
    mark.append(image);
  }
  return mark;
}

function calendarCard(row, kind, onSymbol) {
  const isIPO = kind === 'ipo' || kind === 'ipos';
  const symbol = first(row, ['symbol', 'ticker']);
  const company = first(row, ['name', 'company', 'companyName']) || symbol || 'Company name unavailable';
  const time = first(row, ['time', 'timeOfDay']);
  const timeLabel = { bmo: 'Before open', amc: 'After close', dmh: 'During market hours' }[String(time).toLowerCase()] || time;
  const date = first(row, ['date', 'ipoDate', 'filingDate']);
  const content = [
    el('div', { class: 'mhw-calendar__date' }, [
      el('time', { datetime: date || null, text: dateLabel(date, { weekday: 'short' }) }),
      timeLabel ? el('span', { class: 'mhw-calendar__time', text: timeLabel }) : null,
    ]),
    el('div', { class: 'mhw-calendar__company' }, [
      companyMark(row),
      el('div', { class: 'mhw-calendar__identity' }, [
        el('strong', { class: 'mhw-calendar__symbol', text: symbol || company }),
        el('span', { class: 'mhw-calendar__name', text: company, title: company }),
      ]),
    ]),
    el('dl', { class: 'mhw-calendar__metrics' }, isIPO ? [
      metric('Price', display(first(row, ['priceRange', 'price', 'ipoPrice']))),
      metric('Shares', display(first(row, ['shares', 'sharesOffered', 'numberOfShares']), { compact: true })),
    ] : [
      metric('EPS estimate', display(first(row, ['epsEstimated', 'epsEstimate', 'estimatedEps']), { fixed: true })),
      metric('EPS actual', display(first(row, ['epsActual', 'eps', 'actualEps']), { fixed: true })),
    ]),
  ];
  const card = el('article', { class: 'mhw-calendar__card' });
  if (symbol && typeof onSymbol === 'function') {
    const action = el('button', {
      type: 'button', class: 'mhw-calendar__card-body mhw-calendar__card-body--action',
      'aria-label': `${company} (${symbol}), ${dateLabel(date)}. View company`,
      onclick: () => onSymbol(symbol, row),
    }, content);
    card.append(action);
  } else card.append(el('div', { class: 'mhw-calendar__card-body' }, content));
  return card;
}

/* The strip every calendar on this page rides on: cards that scroll under two
   arrows and one link. Earnings, IPOs and economic releases carry different
   cards and the same behaviour, which is why the behaviour lives here once. */
function filmstrip(cards, { label, onAll } = {}) {
  const root = el('div', { class: 'mhw-calendar' });
  const strip = el('div', {
    class: 'mhw-calendar__strip', tabindex: '0', role: 'region', 'aria-label': label,
  }, cards);
  const previous = el('button', {
    type: 'button', class: 'mhw-carousel-arrow', 'aria-label': 'Previous calendar events',
    onclick: () => move(-1),
  }, [arrow('left')]);
  const next = el('button', {
    type: 'button', class: 'mhw-carousel-arrow', 'aria-label': 'Next calendar events',
    onclick: () => move(1),
  }, [arrow('right')]);
  const controls = el('div', { class: 'mhw-calendar__controls' }, [
    el('div', { class: 'mhw-calendar__arrows' }, [previous, next]),
    typeof onAll === 'function' ? el('button', {
      type: 'button', class: 'mhw-see-all', onclick: () => onAll(),
    }, ['See all', arrow('right')]) : null,
  ]);
  function update() {
    previous.disabled = strip.scrollLeft <= 2;
    next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
  }
  function move(direction) {
    strip.scrollBy({ left: direction * Math.max(260, strip.clientWidth * 0.8),
      behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  strip.addEventListener('scroll', update, { passive: true });
  strip.addEventListener('keydown', event => {
    if (event.target !== strip) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  // Refresh when revisiting the widget after a viewport change, without global listeners.
  root.addEventListener('pointerenter', update);
  root.addEventListener('focusin', update);
  previous.disabled = true;
  root.append(strip, controls);
  requestAnimationFrame(update);
  return root;
}

/** Horizontal earnings or IPO calendar; callbacks receive source symbols. */
export function calendarStrip(rows, { kind = 'earnings', onSymbol, onAll } = {}) {
  const items = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const ipo = kind === 'ipo' || kind === 'ipos';
  if (!items.length) {
    const root = el('div', { class: 'mhw-calendar' });
    root.append(empty(ipo
      ? 'No upcoming IPOs are available for this period.'
      : 'No earnings releases are available for this period.'));
    return root;
  }
  return filmstrip(items.map(row => calendarCard(row, kind, onSymbol)),
    { label: ipo ? 'IPO calendar' : 'Earnings calendar', onAll });
}

/** Treasury yields are percentage points: a value of 4.25 is displayed as 4.25%. */
export function yieldCurve(rows) {
  const root = el('div', { class: 'mhw-yield' });
  const points = (Array.isArray(rows) ? rows : []).filter(row => row && number(row.value) != null)
    .map(row => ({ ...row, value: number(row.value) }));
  if (!points.length) {
    root.append(empty('Treasury yield data is currently unavailable.'));
    return root;
  }
  if (points.every(row => number(row.months) != null)) points.sort((a, b) => a.months - b.months);
  const width = 1000, height = 340;
  const left = 26, right = 67, top = 28, bottom = 59;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const minimum = Math.min(...points.map(row => row.value));
  const maximum = Math.max(...points.map(row => row.value));
  const span = Math.max(maximum - minimum, 0.5);
  const stepBase = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(stepBase));
  const step = [1, 2, 2.5, 5, 10].map(value => value * magnitude).find(value => value >= stepBase) || magnitude * 10;
  const low = Math.floor((minimum - span * 0.12) / step) * step;
  const high = Math.ceil((maximum + span * 0.12) / step) * step;
  const scaleX = index => left + (points.length === 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
  const scaleY = value => top + plotHeight - (value - low) / (high - low) * plotHeight;
  const chart = svg('svg', {
    class: 'mhw-yield__chart', viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': `US Treasury yield curve. ${points.map(row => `${row.label}: ${display(row.value)} percent`).join('; ')}`,
  }, [svg('title', {}, ['US Treasury yields by maturity'])]);
  for (let tick = low; tick <= high + step / 100; tick += step) {
    const y = scaleY(tick);
    chart.append(svg('line', { class: 'mhw-chart-grid', x1: left, y1: y, x2: width - right, y2: y }));
    chart.append(svg('text', { class: 'mhw-chart-label', x: width - right + 15, y: y + 4 }, [
      `${display(Math.abs(tick) < step / 100 ? 0 : tick, { decimals: 2 })}%`,
    ]));
  }
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${scaleX(index).toFixed(2)},${scaleY(point.value).toFixed(2)}`).join(' ');
  if (points.length > 1) chart.append(svg('path', {
    class: 'mhw-yield__area', d: `${path} L${scaleX(points.length - 1)},${top + plotHeight} L${scaleX(0)},${top + plotHeight}Z`,
  }));
  chart.append(svg('path', { class: 'mhw-yield__line', d: path }));
  points.forEach((point, index) => {
    const x = scaleX(index), y = scaleY(point.value);
    chart.append(svg('text', { class: 'mhw-chart-label mhw-chart-label--maturity', x, y: height - 30, 'text-anchor': 'middle' }, [
      String(point.label || `${point.months}M`),
    ]));
    const description = `${point.label}: ${display(point.value, { fixed: true })}%${point.date ? ` · ${dateLabel(point.date, { year: 'numeric' })}` : ''}`;
    chart.append(svg('circle', { class: 'mhw-yield__point', cx: x, cy: y, r: 4 }));
    chart.append(svg('circle', {
      class: 'mhw-yield__hit', cx: x, cy: y, r: 14, tabindex: '0', 'aria-label': description,
    }, [svg('title', {}, [description])]));
  });
  const date = points.find(point => point.date)?.date;
  root.append(chart, el('div', { class: 'mhw-yield__legend' }, [
    el('span', { class: 'mhw-yield__key' }, [el('i', { 'aria-hidden': 'true' }), 'U.S. Treasury yield']),
    el('span', { text: date ? `As of ${dateLabel(date, { year: 'numeric' })} · Maturity` : 'Maturity' }),
  ]));
  return root;
}

function indicatorSparkline(history) {
  const points = (Array.isArray(history) ? history : [])
    .map(row => typeof row === 'number' ? { value: row } : row)
    .filter(row => row && number(row.value) != null)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (points.length < 2) return null;
  const values = points.map(row => number(row.value));
  const low = Math.min(...values), high = Math.max(...values);
  const width = 150, height = 46, pad = 4;
  const coords = values.map((value, index) => [
    pad + index / (values.length - 1) * (width - pad * 2),
    high === low ? height / 2 : height - pad - (value - low) / (high - low) * (height - pad * 2),
  ]);
  return svg('svg', {
    class: 'mhw-indicator__sparkline', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true',
  }, [svg('path', {
    class: 'mhw-indicator__line', d: coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x},${y}`).join(' '),
  })]);
}

/** Country-specific observations; never infer world coverage from US data. */
export function economicIndicators(rows) {
  const items = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const root = el('div', { class: 'mhw-indicators' });
  if (!items.length) {
    root.append(empty('Economic indicators are currently unavailable.'));
    return root;
  }
  for (const row of items) {
    const unit = row.unit || '';
    root.append(el('article', { class: 'mhw-indicator' }, [
      el('div', { class: 'mhw-indicator__heading' }, [
        el('h3', { text: row.name || row.symbol || 'Economic indicator' }),
        row.country ? el('span', { class: 'mhw-indicator__country', text: row.country }) : null,
      ]),
      // A caller that knows the series' unit formats the value itself; the rest
      // get the plain reading. Either way the card prints one number.
      row.note ? el('p', { class: 'mhw-indicator__note', text: row.note }) : null,
      el('div', { class: 'mhw-indicator__body' }, [
        el('p', { class: 'mhw-indicator__value' }, [
          row.display != null ? row.display : display(row.value),
          unit ? el('span', { class: unit === '%' ? 'mhw-indicator__percent' : 'mhw-indicator__unit', text: unit }) : null,
        ]),
        indicatorSparkline(row.history),
      ]),
      row.change ? el('p', { class: `mhw-indicator__change ${row.change.direction || ''}`.trim(), text: row.change.text }) : null,
      el('time', { class: 'mhw-indicator__date', datetime: row.date || null,
        text: row.dateText || (row.date ? `Latest release · ${dateLabel(row.date, { year: 'numeric' })}` : 'Release date unavailable') }),
    ]));
  }
  return root;
}

function releaseTime(row) {
  const explicit = first(row, ['time', 'releaseTime']);
  if (explicit) return String(explicit);
  return String(first(row, ['date', 'datetime', 'eventDate']) || '').match(/[T ](\d{2}:\d{2})/)?.[1] || DASH;
}

function impactCell(value) {
  const normalized = String(value ?? '').toLowerCase();
  const level = { low: 1, medium: 2, moderate: 2, high: 3, '1': 1, '2': 2, '3': 3 }[normalized];
  if (!level) return el('span', { text: value || DASH });
  return el('span', { class: `mhw-impact mhw-impact--${level}`, role: 'img',
    'aria-label': `${['', 'Low', 'Medium', 'High'][level]} impact`, title: `${['', 'Low', 'Medium', 'High'][level]} impact`,
  }, [1, 2, 3].map(index => el('i', { class: index <= level ? 'mhw-impact__bar mhw-impact__bar--active' : 'mhw-impact__bar' })));
}

/** Today and tomorrow by name, everything else by its date. */
function dayLabel(value, now = new Date()) {
  const day = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return dateLabel(value, { weekday: 'short' });
  const today = new Date(now.getTime()).toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  if (day === today) return 'Today';
  if (day === tomorrow) return 'Tomorrow';
  return dateLabel(day, { weekday: 'short' });
}

function releaseStat(label, value, strong = false) {
  return el('div', { class: `mhw-release__stat${strong ? ' is-actual' : ''}` }, [
    el('dt', { text: label }), el('dd', { text: value }),
  ]);
}

function releaseCard(row) {
  const date = first(row, ['date', 'datetime', 'eventDate']);
  const country = first(row, ['country', 'countryCode']);
  const event = first(row, ['event', 'name', 'title']) || 'Economic release';
  const unit = row.unit && row.unit !== 'N/A' ? String(row.unit) : '';
  const actual = first(row, ['actual', 'actualValue']);
  // A percentage hugs its number the way a release quotes it; every other unit
  // is a word after one.
  const text = value => value == null || value === ''
    ? DASH : `${display(value, { compact: true })}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
  return el('article', { class: 'mhw-calendar__card mhw-release' }, [
    el('div', { class: 'mhw-calendar__card-body' }, [
      el('div', { class: 'mhw-release__top' }, [
        el('div', { class: 'mhw-calendar__date' }, [
          el('time', { datetime: String(date || '').slice(0, 10) || null, text: dayLabel(date) }),
          el('span', { class: 'mhw-calendar__time', text: releaseTime(row) }),
        ]),
        impactCell(first(row, ['impact', 'importance'])),
      ]),
      el('div', { class: 'mhw-release__event' }, [
        countryFlag(country, { className: 'mhw-release__flag' }),
        el('strong', { class: 'mhw-release__name', title: `${event}${country ? ` · ${country}` : ''}`, text: event }),
      ]),
      // Actual first and lit, the way a release is read: the number that moved
      // the market, then what it was measured against.
      el('dl', { class: 'mhw-release__stats' }, [
        releaseStat('Actual', text(actual), actual != null && actual !== ''),
        releaseStat('Forecast', text(first(row, ['estimate', 'consensus', 'forecast', 'estimated']))),
        releaseStat('Prior', text(first(row, ['previous', 'previousValue', 'prev']))),
      ]),
    ]),
  ]);
}

/**
 * The release calendar as cards — the strip the earnings calendar uses, with a
 * release's actual, forecast and prior in place of a company's EPS. `limit`
 * caps the strip; `onAll` is the way to the full table, which is where a reader
 * comparing a hundred releases belongs.
 */
export function economicReleaseCards(rows, { limit = 18, onAll } = {}) {
  const items = (Array.isArray(rows) ? rows : []).filter(Boolean)
    .sort((a, b) => String(first(a, ['date', 'datetime', 'eventDate']) || '')
      .localeCompare(String(first(b, ['date', 'datetime', 'eventDate']) || '')));
  if (!items.length) {
    const root = el('div', { class: 'mhw-calendar' });
    root.append(empty('No economic releases are available for this period.'));
    return root;
  }
  return filmstrip(items.slice(0, limit).map(releaseCard), { label: 'Economic calendar', onAll });
}

/** Compact release table accepting the FMP stable economics-calendar shape. */
export function economicCalendar(rows) {
  const items = (Array.isArray(rows) ? rows : []).filter(Boolean)
    .sort((a, b) => String(first(a, ['date', 'datetime', 'eventDate']) || '').localeCompare(String(first(b, ['date', 'datetime', 'eventDate']) || '')));
  const root = el('div', { class: 'mhw-economic-calendar' });
  if (!items.length) {
    root.append(empty('No economic releases are available for this period.'));
    return root;
  }
  const table = el('table', { class: 'mhw-events' }, [
    el('caption', { class: 'mhw-sr-only', text: 'Economic releases. Times are shown as supplied by FMP.' }),
    el('thead', {}, [el('tr', {}, ['Date', 'Time', 'Country', 'Event', 'Actual', 'Forecast', 'Previous', 'Impact']
      .map((label, index) => el('th', { scope: 'col', class: index >= 4 && index <= 6 ? 'mhw-events__numeric' : '', text: label })))]),
  ]);
  const body = el('tbody');
  let priorDate = '';
  for (const row of items) {
    const date = first(row, ['date', 'datetime', 'eventDate']);
    const day = String(date || '').slice(0, 10);
    const country = first(row, ['country', 'countryCode']);
    const event = first(row, ['event', 'name', 'title']) || 'Economic release';
    const actual = first(row, ['actual', 'actualValue']);
    const estimate = first(row, ['estimate', 'consensus', 'forecast', 'estimated']);
    const previous = first(row, ['previous', 'previousValue', 'prev']);
    const unit = row.unit && row.unit !== 'N/A' ? String(row.unit) : '';
    const valueText = value => `${display(value, { compact: true })}${value != null && value !== '' && unit ? ` ${unit}` : ''}`;
    body.append(el('tr', { class: priorDate && priorDate !== day ? 'mhw-events__new-day' : '' }, [
      el('td', { class: 'mhw-events__date' }, [el('time', { datetime: day || null, text: dateLabel(date) })]),
      el('td', { class: 'mhw-events__time', text: releaseTime(row) }),
      el('td', { class: 'mhw-events__country', text: country || DASH }),
      el('th', { scope: 'row', class: 'mhw-events__event', text: event }),
      el('td', { class: 'mhw-events__numeric mhw-events__actual', text: valueText(actual) }),
      el('td', { class: 'mhw-events__numeric', text: valueText(estimate) }),
      el('td', { class: 'mhw-events__numeric', text: valueText(previous) }),
      el('td', { class: 'mhw-events__impact' }, [impactCell(first(row, ['impact', 'importance']))]),
    ]));
    priorDate = day;
  }
  table.append(body);
  root.append(el('div', { class: 'mhw-events__scroll', tabindex: '0', role: 'region', 'aria-label': 'Economic calendar table' }, [table]),
    el('p', { class: 'mhw-events__note', text: 'Release times are shown as supplied by FMP. All values reflect the latest available release.' }));
  return root;
}
