/* Market overview chart. All plotted observations come from FMP. */
import { el } from './util.js';
import { fetchFor, getApiKey } from './fmp.js';

const NS = 'http://www.w3.org/2000/svg';
const RANGES = ['1D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];
let chartId = 0;

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return node;
}

function glyph(path) {
  const node = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  node.append(svg('path', { d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return node;
}

const finite = value => value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value));
const number = value => finite(value) ? Number(value) : null;
const dateKey = date => date.toISOString().slice(0, 10);

function startFor(range) {
  const date = new Date();
  if (range === 'ALL') return '1970-01-01';
  if (range === '1D') date.setUTCDate(date.getUTCDate() - 7);
  else if (range === 'YTD') date.setUTCMonth(0, 1);
  else if (range.endsWith('M')) date.setUTCMonth(date.getUTCMonth() - Number(range.slice(0, -1)));
  else date.setUTCFullYear(date.getUTCFullYear() - Number(range.slice(0, -1)));
  return dateKey(date);
}

/** FMP can return either a flat list or its older historical envelope. */
function observations(payload) {
  const list = Array.isArray(payload) ? payload : payload?.historical || [];
  const byDate = new Map();
  for (const row of list) {
    const date = String(row.date || row.datetime || '');
    const close = number(row.close ?? row.price);
    if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(date) || close === null) continue;
    byDate.set(date, { date, close, open: number(row.open), high: number(row.high), low: number(row.low) });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function dateLabel(value, intraday = false, full = false) {
  if (intraday && !full) return value.slice(11, 16);
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  const label = date.toLocaleDateString('en-US', full
    ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return intraday && full ? `${label}, ${value.slice(11, 16)}` : label;
}

function combineCandles(rows, count) {
  if (rows.length <= count) return rows;
  const size = Math.ceil(rows.length / count);
  const result = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    result.push({
      date: chunk.at(-1).date, startDate: chunk[0].date,
      open: chunk[0].open, close: chunk.at(-1).close,
      high: Math.max(...chunk.map(row => row.high)), low: Math.min(...chunk.map(row => row.low)),
    });
  }
  return result;
}

/**
 * Returns a chart node with setSymbol(meta), setRange(range), and destroy().
 * onOpen, when supplied, is called with the selected symbol by the title link.
 */
export function marketChart(initial) {
  let meta = { currency: 'USD', ...initial };
  let range = '1D';
  let style = 'area';
  let records = [];
  let result = null;
  let requestId = 0;
  let dead = false;
  let connected = false;
  let selected = -1;
  let geometry = null;
  let modal = null;
  let placeholder = null;
  let cachedKey = getApiKey();
  const local = new Map();
  const id = `mhc-${++chartId}`;

  const title = el('button', { type: 'button', class: 'mhc__title', onclick: () => meta.onOpen?.(meta.symbol) });
  const price = el('span', { class: 'mhc__price' });
  const currency = el('span', { class: 'mhc__currency' });
  const change = el('span', { class: 'mhc__change' });
  const detail = el('div', { class: 'mhc__detail' });
  const drawing = svg('svg', { class: 'mhc__svg', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  const message = el('div', { class: 'mhc__message', role: 'status', 'aria-live': 'polite' });
  const plot = el('div', { class: 'mhc__plot', tabindex: '0', role: 'group', 'aria-label': 'Price history. Use the left and right arrow keys to inspect prices.' }, [drawing, message]);
  const source = el('span', { class: 'mhc__source' });
  const rangeButtons = new Map();
  const ranges = el('div', { class: 'mhc__ranges', role: 'group', 'aria-label': 'Chart time range' }, RANGES.map(value => {
    const button = el('button', { type: 'button', text: value, class: 'mhc__range', 'aria-pressed': value === range ? 'true' : 'false', onclick: () => setRange(value) });
    rangeButtons.set(value, button);
    return button;
  }));
  const area = el('button', { type: 'button', class: 'mhc__tool is-active', title: 'Area chart', 'aria-label': 'Area chart', 'aria-pressed': 'true', onclick: () => setStyle('area') }, [glyph('M3 17l5-6 4 3 8-10M3 21h18')]);
  const candles = el('button', { type: 'button', class: 'mhc__tool', title: 'Candlestick chart', 'aria-label': 'Candlestick chart', 'aria-pressed': 'false', onclick: () => setStyle('candles') }, [glyph('M7 3v4m0 10v4m10-18v7m0 7v4M4 7h6v10H4zM14 10h6v7h-6z')]);
  const expand = el('button', { type: 'button', class: 'mhc__tool', title: 'Expand chart', 'aria-label': 'Expand chart', onclick: () => toggleExpand() }, [glyph('M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5')]);
  const root = el('div', { class: 'mhc' }, [
    el('div', { class: 'mhc__head' }, [
      el('div', {}, [title, el('div', { class: 'mhc__quote' }, [price, currency, change])]),
      el('div', { class: 'mhc__tools', role: 'group', 'aria-label': 'Chart appearance' }, [area, candles, expand]),
    ]),
    detail, plot,
    el('div', { class: 'mhc__footer' }, [ranges, source]),
  ]);

  function format(value) {
    if (!Number.isFinite(value)) return '—';
    const decimals = meta.kind === 'forex' || (Math.abs(value) > 0 && Math.abs(value) < 1) ? 4 : 2;
    return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function header(row = null) {
    const quoted = number(meta.quote?.price);
    const value = row?.close ?? records.at(-1)?.close ?? quoted;
    title.textContent = `${meta.name || meta.symbol}${meta.name && meta.name !== meta.symbol ? ` · ${meta.symbol}` : ''}`;
    title.disabled = !meta.onOpen;
    price.textContent = format(value);
    currency.textContent = meta.currency || 'USD';
    const first = records[0]?.close;
    const last = row?.close ?? records.at(-1)?.close;
    const delta = Number.isFinite(first) && Number.isFinite(last) ? last - first : null;
    const percent = delta !== null && first ? delta / Math.abs(first) * 100 : null;
    change.textContent = percent === null ? '' : `${delta >= 0 ? '+' : '−'}${format(Math.abs(delta))} (${percent >= 0 ? '+' : '−'}${Math.abs(percent).toFixed(2)}%)`;
    change.className = `mhc__change ${delta < 0 ? 'is-down' : 'is-up'}`;
    if (row) {
      const date = row.startDate && row.startDate !== row.date ? `${dateLabel(row.startDate, range === '1D', true)} – ${dateLabel(row.date, range === '1D', true)}` : dateLabel(row.date, range === '1D', true);
      detail.replaceChildren(el('span', { text: date }), ...(hasOHLC(row)
        ? ['open', 'high', 'low', 'close'].map(key => el('span', {}, [el('i', { text: key[0].toUpperCase() }), ` ${format(row[key])}`]))
        : [el('span', { text: `Close ${format(row.close)}` })]));
    } else {
      detail.textContent = records.length ? `${range === '1D' ? 'Latest session' : range === 'ALL' ? 'All available history' : `${range} performance`} · ${dateLabel(records[0].date, range === '1D', true)} – ${dateLabel(records.at(-1).date, range === '1D', true)}` : ' ';
    }
  }

  function hasOHLC(row) {
    return ['open', 'high', 'low', 'close'].every(key => Number.isFinite(row[key]));
  }

  function setStyle(next) {
    if (next === 'candles' && candles.disabled) return;
    style = next;
    for (const [button, value] of [[area, 'area'], [candles, 'candles']]) {
      button.classList.toggle('is-active', value === style);
      button.setAttribute('aria-pressed', String(value === style));
    }
    draw();
  }

  function setRange(next) {
    if (!RANGES.includes(next) || dead) return;
    range = next;
    for (const [value, button] of rangeButtons) {
      button.classList.toggle('is-active', value === range);
      button.setAttribute('aria-pressed', String(value === range));
    }
    load();
  }

  async function load() {
    const current = ++requestId;
    const symbol = meta.symbol;
    records = [];
    result = null;
    selected = -1;
    header();
    draw();
    root.setAttribute('aria-busy', 'true');
    message.replaceChildren(el('span', { class: 'mhc__spinner', 'aria-hidden': 'true' }), el('span', { text: `Loading ${meta.name || symbol} history…` }));
    source.textContent = 'FMP';
    const from = startFor(range);
    const to = dateKey(new Date());
    const intraday = range === '1D';
    const credential = getApiKey();
    if (cachedKey !== credential) { local.clear(); cachedKey = credential; }
    // Reuse a wider, previously fetched daily window when a reader zooms in.
    const hit = [...local.values()].find(entry => entry.symbol === symbol && entry.intraday === intraday && entry.from <= from && entry.to === to && Date.now() - entry.at < 600000);
    let response = hit?.response;
    try {
      if (!response) {
        response = await fetchFor(intraday ? 'marketIntraday' : 'marketHistory', symbol, { from, to });
        // Some FMP plans expose closes, but no full OHLC history.
        if (!intraday && response.status !== 'skipped' && (response.status !== 'ok' || !observations(response.data).length)) {
          const fallback = await fetchFor('prices', symbol, { from, to });
          if (fallback.status === 'ok' && observations(fallback.data).length) response = fallback;
        }
        if (response.status === 'ok' && credential === getApiKey()) local.set(`${symbol}|${intraday}|${from}|${to}`, { symbol, intraday, from, to, response, at: Date.now() });
      }
    } catch {
      response = { status: 'error', message: 'The history request could not be completed.' };
    }
    if (dead || current !== requestId || symbol !== meta.symbol) return;
    if (connected && !root.isConnected && !modal) { destroy(); return; }
    result = response;
    records = observations(response.data).filter(row => row.date.slice(0, 10) >= from && row.date.slice(0, 10) <= to);
    if (intraday && records.length) {
      const latest = records.at(-1).date.slice(0, 10);
      records = records.filter(row => row.date.startsWith(latest));
    }
    const supportsCandles = records.length > 0 && records.every(hasOHLC);
    candles.disabled = !supportsCandles;
    candles.title = supportsCandles ? 'Candlestick chart' : 'OHLC prices are unavailable for this series';
    if (style === 'candles' && !supportsCandles) setStyle('area');
    root.removeAttribute('aria-busy');
    header();
    source.textContent = records.length ? `FMP · ${intraday ? '5-minute prices' : supportsCandles ? 'Daily prices' : 'Daily close'} · ${dateLabel(records.at(-1).date, false, true)}` : 'FMP';
    draw();
  }

  function draw() {
    if (dead) return;
    selected = -1;
    geometry = null;
    drawing.replaceChildren();
    const width = Math.max(plot.clientWidth || 1000, 240);
    const height = plot.clientHeight || 385;
    const left = 8, right = Math.min(88, width * .23), top = 24, bottom = 32;
    const w = width - left - right, h = height - top - bottom;
    drawing.setAttribute('viewBox', `0 0 ${width} ${height}`);
    message.hidden = records.length >= 2;
    if (records.length < 2) {
      for (let i = 0; i <= 4; i++) drawing.append(svg('line', { x1: left, x2: width - right, y1: top + h * i / 4, y2: top + h * i / 4, class: 'mhc__grid' }));
      if (result) {
        let copy = range === '1D' ? 'Intraday history is unavailable for this symbol.' : 'Price history is unavailable for this symbol.';
        if (result.status === 'gated') copy = `${range === '1D' ? 'Intraday' : 'This price'} history is not included in your FMP plan.`;
        if (result.status === 'skipped') copy = 'Connect your FMP API key in Settings to load this chart.';
        if (result.status === 'error') copy = result.message || 'FMP could not load price history. Try again.';
        if (records.length === 1) copy = 'FMP returned one observation for this period. Choose a longer range.';
        message.replaceChildren(glyph('M4 19V5m0 14h16M8 14l4-5 4 3 4-7'), el('strong', { text: 'No chart data' }), el('span', { text: copy }), el('button', { class: 'mhc__retry', type: 'button', text: 'Try again', onclick: () => load() }));
      }
      return;
    }
    const rows = style === 'candles' ? combineCandles(records, Math.max(30, Math.floor(w / 6))) : records;
    const values = rows.flatMap(row => style === 'candles' ? [row.high, row.low] : [row.close]);
    const min = Math.min(...values), max = Math.max(...values);
    const pad = (max - min || Math.abs(max) * .02 || 1) * .13;
    const low = min - pad, high = max + pad;
    const x = index => left + index / (rows.length - 1) * w;
    const y = value => top + (high - value) / (high - low) * h;
    const defs = svg('defs');
    const gradient = svg('linearGradient', { id: `${id}-fill`, x1: 0, x2: 0, y1: 0, y2: 1 });
    gradient.append(svg('stop', { offset: '0%', 'stop-color': 'var(--mh-blue, #2962ff)', 'stop-opacity': '.2' }), svg('stop', { offset: '100%', 'stop-color': 'var(--mh-blue, #2962ff)', 'stop-opacity': '.015' }));
    const clip = svg('clipPath', { id: `${id}-clip` });
    clip.append(svg('rect', { x: left, y: top - 8, width: w, height: h + 8 }));
    defs.append(gradient, clip);
    drawing.append(defs);
    for (let i = 0; i <= 4; i++) {
      const value = high - (high - low) * i / 4;
      drawing.append(svg('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), class: 'mhc__grid' }), svg('text', { x: width - right + 10, y: y(value) + 4, class: 'mhc__axis' }, format(value)));
    }
    const labelCount = width < 520 ? 3 : 6;
    for (let i = 0; i < labelCount; i++) {
      const index = Math.round(i / (labelCount - 1) * (rows.length - 1));
      const d = rows[index].date;
      let label = dateLabel(d, range === '1D');
      if (['1M', '3M'].includes(range)) label = new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      drawing.append(svg('text', { x: x(index), y: height - 9, 'text-anchor': i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle', class: 'mhc__axis' }, label));
    }
    const chart = svg('g', { 'clip-path': `url(#${id}-clip)` });
    if (style === 'area') {
      const path = rows.map((row, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(row.close).toFixed(2)}`).join(' ');
      chart.append(svg('path', { d: `${path} L${x(rows.length - 1)} ${top + h} L${left} ${top + h} Z`, fill: `url(#${id}-fill)` }), svg('path', { d: path, class: 'mhc__line', fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    } else {
      const candleWidth = Math.max(2, Math.min(12, w / rows.length * .67));
      rows.forEach((row, index) => {
        const color = row.close >= row.open ? 'mhc__candle-up' : 'mhc__candle-down';
        chart.append(svg('line', { x1: x(index), x2: x(index), y1: y(row.high), y2: y(row.low), class: color }), svg('rect', { x: x(index) - candleWidth / 2, y: Math.min(y(row.open), y(row.close)), width: candleWidth, height: Math.max(1, Math.abs(y(row.open) - y(row.close))), class: color }));
      });
    }
    drawing.append(chart);
    const last = rows.at(-1).close, lastY = y(last);
    drawing.append(svg('line', { x1: left, x2: width - right, y1: lastY, y2: lastY, class: 'mhc__last-line' }), svg('rect', { x: width - right + 3, y: lastY - 11, width: right - 5, height: 22, rx: 3, class: 'mhc__last-badge' }), svg('text', { x: width - right + (right - 2) / 2, y: lastY + 4, 'text-anchor': 'middle', class: 'mhc__last-text' }, format(last)));
    const cross = svg('g', { class: 'mhc__cross', visibility: 'hidden' });
    const vertical = svg('line', { y1: top, y2: top + h });
    const horizontal = svg('line', { x1: left, x2: width - right });
    const dot = svg('circle', { r: 4.5 });
    const dateBox = svg('rect', { y: height - bottom + 3, width: 130, height: 24, rx: 3, class: 'mhc__cross-date' });
    const dateText = svg('text', { y: height - bottom + 19, 'text-anchor': 'middle', class: 'mhc__cross-text' });
    cross.append(vertical, horizontal, dot, dateBox, dateText);
    drawing.append(cross);
    geometry = { width, rows, x, y, left, w, cross, vertical, horizontal, dot, dateBox, dateText };
  }

  function inspect(index) {
    if (!geometry) return;
    const g = geometry;
    selected = Math.max(0, Math.min(g.rows.length - 1, index));
    const row = g.rows[selected], xx = g.x(selected), yy = g.y(row.close);
    g.cross.setAttribute('visibility', 'visible');
    g.vertical.setAttribute('x1', xx); g.vertical.setAttribute('x2', xx);
    g.horizontal.setAttribute('y1', yy); g.horizontal.setAttribute('y2', yy);
    g.dot.setAttribute('cx', xx); g.dot.setAttribute('cy', yy);
    const labelX = Math.max(65, Math.min(g.width - 65, xx));
    g.dateBox.setAttribute('x', labelX - 65);
    g.dateText.setAttribute('x', labelX);
    g.dateText.textContent = range === '1D' ? `${row.date.slice(5, 10)} ${row.date.slice(11, 16)}` : dateLabel(row.date, false, true);
    header(row);
  }

  function leave() {
    selected = -1;
    geometry?.cross.setAttribute('visibility', 'hidden');
    header();
  }
  plot.addEventListener('pointermove', event => {
    if (!geometry) return;
    const rect = plot.getBoundingClientRect();
    const xx = (event.clientX - rect.left) / rect.width * geometry.width;
    inspect(Math.round((xx - geometry.left) / geometry.w * (geometry.rows.length - 1)));
  });
  plot.addEventListener('pointerleave', leave);
  plot.addEventListener('blur', leave);
  plot.addEventListener('keydown', event => {
    if (!geometry || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') { leave(); return; }
    const position = selected < 0 ? geometry.rows.length - 1 : selected;
    inspect(event.key === 'Home' ? 0 : event.key === 'End' ? geometry.rows.length - 1 : position + (event.key === 'ArrowLeft' ? -1 : 1));
    plot.setAttribute('aria-label', `${meta.name || meta.symbol}, ${dateLabel(geometry.rows[selected].date, range === '1D', true)}, ${format(geometry.rows[selected].close)} ${meta.currency || 'USD'}. Use arrow keys to inspect prices.`);
  });

  function toggleExpand() {
    if (modal) { modal.close(); return; }
    placeholder = document.createComment('market-chart');
    root.replaceWith(placeholder);
    modal = el('dialog', { class: 'mhc-modal', 'aria-label': `${meta.name || meta.symbol} expanded chart` });
    // Dialog lives outside the market page; preserve its theme token overrides.
    const theme = getComputedStyle(placeholder.parentElement || document.documentElement);
    for (const token of ['--mh-bg', '--mh-fg', '--mh-muted', '--mh-border', '--mh-blue']) {
      const value = theme.getPropertyValue(token).trim();
      if (value) modal.style.setProperty(token, value);
    }
    const closing = modal;
    modal.addEventListener('close', () => {
      placeholder?.replaceWith(root);
      closing.remove();
      modal = null; placeholder = null;
      expand.title = 'Expand chart'; expand.setAttribute('aria-label', 'Expand chart');
      root.classList.remove('is-expanded');
      draw(); expand.focus();
    }, { once: true });
    modal.addEventListener('click', event => { if (event.target === closing) closing.close(); });
    modal.append(root);
    document.body.append(modal);
    root.classList.add('is-expanded');
    expand.title = 'Close expanded chart'; expand.setAttribute('aria-label', 'Close expanded chart');
    modal.showModal();
    draw(); expand.focus();
  }

  const resize = new ResizeObserver(() => {
    if (root.isConnected) { connected = true; draw(); }
    else if (connected && !modal) destroy();
  });
  resize.observe(plot);

  function destroy() {
    if (dead) return;
    dead = true;
    requestId++;
    resize.disconnect();
    if (modal) modal.close();
    local.clear();
  }

  root.setSymbol = next => {
    if (dead) return;
    meta = { currency: 'USD', onOpen: initial.onOpen, ...next };
    load();
  };
  root.setRange = setRange;
  root.destroy = destroy;
  rangeButtons.get(range).classList.add('is-active');
  load();
  return root;
}

/* The comparison board draws the same axes over several series, so it reads
   these four rather than keeping its own copy. */
export { svg as svgNode, startFor, observations, dateLabel };
