/* The market summary chart: several instruments on one percentage axis.

   Every line starts at zero on the first session of the window it draws, so
   what is compared is performance over that window and nothing else — levels
   are never mixed into one scale. Closes come from FMP; a series with no
   history draws nothing rather than a flat line at zero.

   Markets keep different holidays, so the x axis is the union of the sessions
   the visible series traded and each line carries its last close across a day
   its own market was shut. That is a drawn line between two real observations,
   not an invented observation. */
import { el, isNum } from './util.js';
import { fetchFor, getApiKey } from './fmp.js';
import { svgNode as svg, startFor, observations, dateLabel } from './markethub-chart.js';

const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];
export const SERIES_COLORS = ['#2962ff', '#22ab94', '#ff9800', '#26c6da', '#d500a0', '#f7b500', '#7e57c2', '#ef5350'];
const dateKey = date => date.toISOString().slice(0, 10);
const signedPercent = value => !isNum(value) ? '—'
  : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}%`;
const axisPercent = value => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}%`;

/** Round tick steps, so a reader can add them up in their head. */
function ticksFor(min, max, count = 6) {
  const span = (max - min) || 1;
  const magnitude = 10 ** Math.floor(Math.log10(span / count));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(value => value >= span / count) || magnitude * 10;
  const out = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step / 1000; value += step) out.push(Number(value.toFixed(6)));
  return out;
}

/**
 * A comparison chart over `series` ({ symbol, name, shortName, color }).
 *
 * Returns the node, with setSeries(list), setRange(range) and destroy().
 * Each series carries its own checkbox: unchecking it drops the line from the
 * chart and from the scale, which is the whole point of a relative axis.
 */
export function compareChart(input = {}) {
  let series = [];
  let range = RANGES.includes(input.range) ? input.range : '6M';
  let dead = false;
  let connected = false;
  let requestId = 0;
  let geometry = null;
  let cachedKey = getApiKey();
  const history = new Map();
  const results = new Map();
  const local = new Map();

  const legend = el('div', { class: 'mcc__legend', role: 'group', 'aria-label': 'Instruments on the chart' });
  const drawing = svg('svg', { class: 'mcc__svg', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  const tooltip = el('div', { class: 'mcc__tooltip', hidden: true, 'aria-hidden': 'true' });
  const message = el('div', { class: 'mcc__message', role: 'status', 'aria-live': 'polite' });
  const plot = el('div', { class: 'mcc__plot', tabindex: '0', role: 'img' }, [drawing, tooltip, message]);
  const rangeButtons = new Map();
  const ranges = el('div', { class: 'mcc__ranges', role: 'group', 'aria-label': 'Chart time range' }, RANGES.map(value => {
    const button = el('button', {
      type: 'button', text: value, class: `mcc__range${value === range ? ' is-active' : ''}`,
      'aria-pressed': String(value === range), onclick: () => setRange(value),
    });
    rangeButtons.set(value, button);
    return button;
  }));
  const source = el('span', { class: 'mcc__source' });
  const root = el('div', { class: 'mcc' }, [legend, plot, el('div', { class: 'mcc__footer' }, [ranges, source])]);

  function drawLegend() {
    legend.replaceChildren(...series.map(row => {
      const box = el('span', { class: 'mcc__box', 'aria-hidden': 'true', text: row.visible ? '✓' : '' });
      return el('button', {
        type: 'button', class: `mcc__chip${row.visible ? ' is-on' : ''}`, role: 'checkbox',
        'aria-checked': String(row.visible), style: { '--series': row.color },
        onclick: () => {
          // The last visible line stays: an empty chart has no scale to draw.
          if (row.visible && series.filter(item => item.visible).length < 2) return;
          row.visible = !row.visible;
          drawLegend();
          draw();
        },
      }, [box, el('span', { text: row.shortName || row.name || row.symbol })]);
    }));
  }

  function setRange(next) {
    if (!RANGES.includes(next) || dead || next === range) return;
    range = next;
    for (const [value, button] of rangeButtons) {
      button.classList.toggle('is-active', value === range);
      button.setAttribute('aria-pressed', String(value === range));
    }
    load();
  }

  async function fetchSeries(symbol, from, to) {
    const credential = getApiKey();
    if (cachedKey !== credential) { local.clear(); cachedKey = credential; }
    const hit = local.get(`${symbol}|${from}|${to}`);
    if (hit) return hit;
    let response = await fetchFor('prices', symbol, { from, to });
    if (response.status !== 'skipped' && (response.status !== 'ok' || !observations(response.data).length)) {
      const full = await fetchFor('marketHistory', symbol, { from, to });
      if (full.status === 'ok' && observations(full.data).length) response = full;
    }
    if (response.status === 'ok' && credential === getApiKey()) local.set(`${symbol}|${from}|${to}`, response);
    return response;
  }

  async function load() {
    const current = ++requestId;
    const from = startFor(range);
    const to = dateKey(new Date());
    history.clear();
    results.clear();
    geometry = null;
    drawing.replaceChildren();
    message.hidden = false;
    message.replaceChildren(el('span', { class: 'mcc__spinner', 'aria-hidden': 'true' }), el('span', { text: 'Loading price history…' }));
    root.setAttribute('aria-busy', 'true');
    source.textContent = 'FMP';
    const loaded = await Promise.all(series.map(async row => [row.symbol, await fetchSeries(row.symbol, from, to)]));
    if (dead || current !== requestId) return;
    for (const [symbol, response] of loaded) {
      results.set(symbol, response);
      history.set(symbol, observations(response.data).filter(point => point.date.slice(0, 10) >= from && point.date.slice(0, 10) <= to));
    }
    root.removeAttribute('aria-busy');
    const drawn = [...history.values()].filter(points => points.length > 1).length;
    source.textContent = drawn ? `FMP · daily closes · ${drawn} of ${series.length} series` : 'FMP';
    draw();
  }

  /** One row per session, each series carrying its last close across a day its
   *  own market did not trade. Returns null before two comparable sessions. */
  function frame() {
    const visible = series.filter(row => row.visible && (history.get(row.symbol) || []).length > 1);
    if (!visible.length) return null;
    const dates = [...new Set(visible.flatMap(row => history.get(row.symbol).map(point => point.date.slice(0, 10))))].sort();
    if (dates.length < 2) return null;
    const lines = visible.map(row => {
      const points = history.get(row.symbol);
      let index = 0, last = null, base = null;
      const values = dates.map(date => {
        while (index < points.length && points[index].date.slice(0, 10) <= date) { last = points[index].close; index += 1; }
        if (last === null) return null;
        if (base === null && last > 0) base = last;
        return base > 0 ? (last / base - 1) * 100 : null;
      });
      return { ...row, values };
    }).filter(line => line.values.some(value => value !== null));
    return lines.length ? { dates, lines } : null;
  }

  function draw() {
    if (dead) return;
    drawing.replaceChildren();
    tooltip.hidden = true;
    geometry = null;
    const width = Math.max(plot.clientWidth || 1000, 240);
    const height = plot.clientHeight || 420;
    const left = 8, right = Math.min(92, width * .22), top = 18, bottom = 30;
    const w = width - left - right, h = height - top - bottom;
    drawing.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const built = frame();
    message.hidden = Boolean(built);
    if (!built) {
      for (let i = 0; i <= 4; i++) drawing.append(svg('line', { x1: left, x2: width - right, y1: top + h * i / 4, y2: top + h * i / 4, class: 'mcc__grid' }));
      if (!root.hasAttribute('aria-busy')) {
        const first = [...results.values()][0];
        const copy = !first ? 'No instruments are selected.'
          : first.status === 'skipped' ? 'Connect your FMP API key in Settings to load these charts.'
            : first.status === 'gated' ? 'Price history is not included in your FMP plan.'
              : 'FMP returned no daily history for these symbols over this period.';
        message.replaceChildren(el('strong', { text: 'No chart data' }), el('span', { text: copy }),
          el('button', { type: 'button', class: 'mcc__retry', text: 'Try again', onclick: () => load() }));
      }
      return;
    }
    const { dates, lines } = built;
    const all = lines.flatMap(line => line.values).filter(value => value !== null);
    const min = Math.min(0, ...all), max = Math.max(0, ...all);
    const pad = (max - min || 1) * .08;
    const low = min - pad, high = max + pad;
    const x = index => left + index / (dates.length - 1) * w;
    const y = value => top + (high - value) / (high - low) * h;
    for (const value of ticksFor(low, high)) {
      drawing.append(svg('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), class: `mcc__grid${Math.abs(value) < 1e-9 ? ' mcc__grid--zero' : ''}` }),
        svg('text', { x: width - right + 10, y: y(value) + 4, class: 'mcc__axis' }, axisPercent(value)));
    }
    const labelCount = width < 520 ? 3 : 6;
    for (let i = 0; i < labelCount; i++) {
      const index = Math.round(i / (labelCount - 1) * (dates.length - 1));
      drawing.append(svg('text', { x: x(index), y: height - 9, class: 'mcc__axis', 'text-anchor': i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle' },
        ['1M', '3M'].includes(range) ? new Date(`${dates[index]}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : dateLabel(dates[index])));
    }
    for (const line of lines) {
      let path = '';
      line.values.forEach((value, index) => {
        if (value === null) return;
        path += `${path ? 'L' : 'M'}${x(index).toFixed(2)} ${y(value).toFixed(2)} `;
      });
      drawing.append(svg('path', { d: path.trim(), class: 'mcc__line', fill: 'none', stroke: line.color, 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }
    // End labels, pushed apart when two series finish within a few pixels.
    const labels = lines.map(line => ({ line, value: [...line.values].reverse().find(value => value !== null) }))
      .filter(item => item.value !== null && item.value !== undefined)
      .map(item => ({ ...item, y: y(item.value) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 19);
    const overflow = labels.length ? labels.at(-1).y - (top + h) : 0;
    if (overflow > 0) labels.forEach(item => { item.y -= overflow; });
    for (const item of labels) {
      drawing.append(svg('rect', { x: width - right + 3, y: item.y - 9.5, width: right - 5, height: 19, rx: 3, fill: item.line.color }),
        svg('text', { x: width - right + (right - 2) / 2, y: item.y + 4, 'text-anchor': 'middle', class: 'mcc__end' }, signedPercent(item.value)));
    }
    const cross = svg('line', { class: 'mcc__cross', y1: top, y2: top + h, visibility: 'hidden' });
    drawing.append(cross);
    plot.setAttribute('aria-label', `Performance since ${dateLabel(dates[0], false, true)}: ${labels.map(item => `${item.line.shortName || item.line.name} ${signedPercent(item.value)}`).join(', ')}`);
    geometry = { width, height, dates, lines, x, y, left, w, cross };
  }

  function inspect(event) {
    if (!geometry) return;
    const g = geometry;
    const rect = plot.getBoundingClientRect();
    const position = (event.clientX - rect.left) / rect.width * g.width;
    const index = Math.max(0, Math.min(g.dates.length - 1, Math.round((position - g.left) / g.w * (g.dates.length - 1))));
    g.cross.setAttribute('visibility', 'visible');
    g.cross.setAttribute('x1', g.x(index));
    g.cross.setAttribute('x2', g.x(index));
    tooltip.replaceChildren(el('strong', { text: dateLabel(g.dates[index], false, true) }),
      ...g.lines.map(line => el('span', { class: 'mcc__tip-row' }, [
        el('i', { style: { background: line.color }, 'aria-hidden': 'true' }),
        el('span', { class: 'mcc__tip-name', text: line.shortName || line.name || line.symbol }),
        el('span', { class: 'mcc__tip-value', text: signedPercent(line.values[index]) }),
      ])));
    tooltip.hidden = false;
    const side = g.x(index) / g.width > .55 ? -1 : 1;
    tooltip.style.left = `${Math.max(0, Math.min(rect.width - tooltip.offsetWidth - 4, g.x(index) / g.width * rect.width + (side > 0 ? 14 : -14 - tooltip.offsetWidth)))}px`;
  }
  plot.addEventListener('pointermove', inspect);
  plot.addEventListener('pointerleave', () => {
    tooltip.hidden = true;
    geometry?.cross.setAttribute('visibility', 'hidden');
  });

  const resize = new ResizeObserver(() => {
    if (root.isConnected) { connected = true; draw(); }
    else if (connected) destroy();
  });
  resize.observe(plot);

  function destroy() {
    if (dead) return;
    dead = true;
    requestId += 1;
    resize.disconnect();
    local.clear();
  }

  root.setSeries = list => {
    if (dead) return;
    series = (list || []).map((row, index) => ({
      ...row, color: row.color || SERIES_COLORS[index % SERIES_COLORS.length], visible: row.visible !== false,
    }));
    drawLegend();
    load();
  };
  root.setRange = setRange;
  root.destroy = destroy;
  root.setSeries(input.series || []);
  return root;
}
