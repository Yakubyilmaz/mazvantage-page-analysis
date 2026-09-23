/* The Economy section's indicator chart.

   A rail of United States series above one chart of the selected series — the
   same shape every asset section on this canvas uses for its quotes, so the
   Economy section reads like the rest of the page rather than like a separate
   product. The rail is `.mh-quote-tab`, the chart is `.mhc`: both skins already
   exist, and reusing them is what keeps the tools in the same corner and the
   ranges in the same place as on an index chart.

   What is different is the cost of a range. `economic-indicators` answers one
   series per request and clips any window wider than ninety days — asking for
   ten years does not fail, it silently returns the last quarter — so history is
   bought a window at a time. A range therefore states its arithmetic before it
   is clicked, and opens on the widest range the board has already paid for, so
   arriving at this section spends nothing.

   Every plotted point is an observation FMP returned. Nothing is interpolated
   between releases: a quarterly series draws four points a year and says so. */
import { el, isNum } from './util.js';
import { indicatorValue, periodOf } from './economy-us.js';
import { svgNode as svg, dateLabel } from './markethub-chart.js';
import { carousel, countryFlag } from './markethub-ui.js';
import { US_INDICATORS, INDICATOR_WINDOW_DAYS, indicatorSpan } from './markethub-data.js';

/* The ranges offered, and what each one costs. There is no "All": with a
   ninety-day cap, "all" is an unbounded number of requests, and a button that
   cannot say what it spends does not belong on this page. */
const RANGES = [
  { id: '3M', days: 92, label: '3 months' },
  { id: '6M', days: 183, label: '6 months' },
  // Three windows is what the board already buys for a quarterly series, and a
  // quarterly series needs all three to draw more than a pair of points.
  { id: '9M', days: 275, label: '9 months' },
  { id: '1Y', days: 366, label: '1 year' },
  { id: '3Y', days: 1096, label: '3 years' },
  { id: '5Y', days: 1827, label: '5 years' },
  { id: '10Y', days: 3653, label: '10 years' },
];
/** Windows the ladder needs to reach back this far: the first covers 95 days. */
const windowsFor = range => Math.max(1, Math.ceil((range.days - 95) / 90) + 1);
const rangeOf = id => RANGES.find(range => range.id === id) || RANGES[0];
const requestNote = count => `${count} FMP ${count === 1 ? 'request' : 'requests'}`;

const at = date => new Date(`${String(date).slice(0, 10)}T12:00:00Z`);
const daysBetween = (from, to) => Math.abs(+at(to) - +at(from)) / 86400000;

/** Axis dates: years over a long run, months over a short one, days for weeks. */
function axisLabel(date, span, step) {
  const when = at(date);
  if (Number.isNaN(when.getTime())) return String(date);
  if (span > 1100) return String(when.getUTCFullYear());
  if (span > 400 || step !== 'week') return dateLabel(date, false);
  return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function glyph(path) {
  const node = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  node.append(svg('path', { d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return node;
}

let chartId = 0;

/**
 * The chart alone. `loadRange(name, windows, onProgress)` buys history and
 * resolves `{ status, points, message }`; without it the chart draws only the
 * observations it was handed.
 *
 * Returns a node with `setSeries(entry)` and `destroy()`.
 */
export function indicatorChart({ loadRange = null } = {}) {
  let series = null;
  let range = RANGES[0];
  let rows = [];
  let style = 'line';
  let status = 'ok';
  let message = '';
  let busy = false;
  let dead = false;
  /* What a range asked for and did not get. A refusal that leaves the previous
     points on screen has to say so, or the reader reads ten years off one. */
  let warning = '';
  let selected = -1;
  let geometry = null;
  let modal = null;
  let placeholder = null;
  let request = 0;
  /* Per series: the widest window count paid for, and every point it bought.
     A reader stepping back down from ten years to one redraws from this rather
     than asking FMP for windows it has already answered. */
  const bought = new Map();
  const id = `emc-${++chartId}`;

  const title = el('span', { class: 'mhc__title' });
  const value = el('span', { class: 'mhc__price' });
  const unitText = el('span', { class: 'mhc__currency' });
  const change = el('span', { class: 'mhc__change' });
  const detail = el('div', { class: 'mhc__detail' });
  const drawing = svg('svg', { class: 'mhc__svg', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  const message_ = el('div', { class: 'mhc__message', role: 'status', 'aria-live': 'polite' });
  const plot = el('div', { class: 'mhc__plot', tabindex: '0', role: 'group',
    'aria-label': 'Observation history. Use the left and right arrow keys to read the series.' }, [drawing, message_]);
  const source = el('span', { class: 'mhc__source' });

  const rangeButtons = new Map();
  const ranges = el('div', { class: 'mhc__ranges', role: 'group', 'aria-label': 'Chart time range' }, RANGES.map(entry => {
    const button = el('button', { type: 'button', class: 'mhc__range', text: entry.id,
      'aria-pressed': 'false', onclick: () => setRange(entry.id) });
    rangeButtons.set(entry.id, button);
    return button;
  }));
  const lineTool = el('button', { type: 'button', class: 'mhc__tool is-active', title: 'Line', 'aria-label': 'Line chart',
    'aria-pressed': 'true', onclick: () => setStyle('line') }, [glyph('M3 17l5-6 4 3 8-10M3 21h18')]);
  const stepTool = el('button', { type: 'button', class: 'mhc__tool', title: 'Steps', 'aria-label': 'Step chart',
    'aria-pressed': 'false', onclick: () => setStyle('step') }, [glyph('M3 18h4v-5h5V8h5V4h4')]);
  const expand = el('button', { type: 'button', class: 'mhc__tool', title: 'Expand chart', 'aria-label': 'Expand chart',
    onclick: () => toggleExpand() }, [glyph('M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5')]);
  const root = el('div', { class: 'mhc emc' }, [
    el('div', { class: 'mhc__head' }, [
      el('div', {}, [title, el('div', { class: 'mhc__quote' }, [value, unitText, change])]),
      el('div', { class: 'mhc__tools', role: 'group', 'aria-label': 'Chart appearance' }, [lineTool, stepTool, expand]),
    ]),
    detail, plot,
    el('div', { class: 'mhc__footer' }, [ranges, source]),
  ]);

  const format = number => indicatorValue(number, series?.unit);
  /* Hidden inside the section — the rail already says whose series this is —
     and read in the expanded chart, where the block's chrome is gone. */
  const sourceText = () => {
    const paid = bought.get(series?.name)?.windows || 1;
    source.textContent = `FMP · ${indicatorSpan(paid)} days loaded`;
  };

  function header(row = null) {
    const latest = row || rows.at(-1) || null;
    title.textContent = series ? `${series.label || series.name} · United States` : '';
    value.textContent = latest ? format(latest.value) : '—';
    unitText.textContent = series?.note || '';
    const first = rows[0]?.value;
    const last = latest?.value;
    // The move across the range, in the unit the series is reported in. A rate
    // moves in percentage points; everything else moves in its own scale.
    const delta = isNum(first) && isNum(last) ? last - first : null;
    if (delta === null || !rows.length) change.textContent = '';
    else if (series?.unit === 'percent') change.textContent = `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(2)} pp over ${range.label}`;
    else change.textContent = first ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta / first * 100).toFixed(2)}% over ${range.label}` : '';
    change.className = `mhc__change ${delta < 0 ? 'is-down' : delta > 0 ? 'is-up' : ''}`.trim();
    if (row) {
      detail.replaceChildren(
        el('span', { text: periodOf(row.date, series?.step) }),
        el('span', {}, [el('i', { text: series?.label || '' }), ` ${format(row.value)}`]),
      );
    } else if (rows.length) {
      detail.replaceChildren(el('span', {
        text: `${periodOf(rows[0].date, series?.step)} – ${periodOf(rows.at(-1).date, series?.step)} · ${rows.length} observations · ${series?.note || ''}`.replace(/ · $/, ''),
      }), ...(warning ? [el('span', { class: 'emc__warn', text: warning })] : []));
    } else detail.textContent = ' ';
  }

  function setStyle(next) {
    style = next;
    for (const [button, name] of [[lineTool, 'line'], [stepTool, 'step']]) {
      button.classList.toggle('is-active', name === style);
      button.setAttribute('aria-pressed', String(name === style));
    }
    draw();
  }

  function syncRanges() {
    const paid = bought.get(series?.name)?.windows || 0;
    for (const [rangeId, button] of rangeButtons) {
      const entry = rangeOf(rangeId);
      const windows = windowsFor(entry);
      const free = windows <= paid;
      button.classList.toggle('is-active', rangeId === range.id);
      button.setAttribute('aria-pressed', String(rangeId === range.id));
      button.disabled = busy;
      button.title = free ? `${entry.label} · already loaded` : `${entry.label} · ${requestNote(windows - paid)} more`;
    }
  }

  /** Cut the bought history down to the range asked for. */
  function clip() {
    const history = bought.get(series?.name);
    const points = history?.points || series?.points || [];
    const floor = Date.now() - range.days * 86400000;
    rows = points.filter(point => +at(point.date) >= floor);
    // A quarterly series over three months can come back with one point or
    // none. Falling back to the last two keeps the readout truthful rather
    // than blank, and `draw` says which period they cover.
    if (rows.length < 2 && points.length >= 2) rows = points.slice(-2);
  }

  async function setRange(next) {
    const entry = rangeOf(next);
    if (dead || busy || !series) return;
    range = entry;
    warning = '';
    const needed = windowsFor(entry);
    const paid = bought.get(series.name)?.windows || 0;
    if (needed <= paid || !loadRange) { clip(); syncRanges(); header(); draw(); return; }
    const current = ++request;
    const name = series.name;
    const owed = needed - paid;
    busy = true;
    syncRanges();
    root.setAttribute('aria-busy', 'true');
    const progress = el('span', { text: `Loading ${entry.label} of ${series.label || name} — ${requestNote(owed)}…` });
    message_.hidden = false;
    message_.replaceChildren(el('span', { class: 'mhc__spinner', 'aria-hidden': 'true' }), progress);
    const result = await loadRange(name, needed, (done, total) => {
      if (!dead && current === request) progress.textContent = `Loading ${entry.label} of ${series.label || name} — window ${done} of ${total}…`;
    });
    if (dead || current !== request) return;
    busy = false;
    root.removeAttribute('aria-busy');
    if (result?.points?.length) bought.set(name, { windows: result.windows || needed, points: result.points });
    else warning = result?.message || `FMP returned nothing for the windows behind ${entry.label}.`;
    status = result?.status || 'error';
    message = result?.message || '';
    if (name !== series?.name) return;
    sourceText();
    clip();
    syncRanges();
    header();
    draw();
  }

  function draw() {
    if (dead) return;
    selected = -1;
    geometry = null;
    drawing.replaceChildren();
    const width = Math.max(plot.clientWidth || 1000, 240);
    const height = plot.clientHeight || 385;
    const left = 8, right = Math.min(96, width * .24), top = 24, bottom = 32;
    const w = width - left - right, h = height - top - bottom;
    drawing.setAttribute('viewBox', `0 0 ${width} ${height}`);
    if (busy) return;
    message_.hidden = rows.length >= 2;
    if (rows.length < 2) {
      for (let i = 0; i <= 4; i++) drawing.append(svg('line', { x1: left, x2: width - right, y1: top + h * i / 4, y2: top + h * i / 4, class: 'mhc__grid' }));
      const copy = status === 'skipped' ? 'Connect your FMP API key in Settings to load this series.'
        : status === 'gated' ? 'This series is not included in your FMP plan.'
          : status === 'error' ? (message || 'FMP could not load this series. Try again.')
            : rows.length === 1 ? 'FMP returned one observation for this range. Choose a longer one.'
              : (message || 'FMP returned no observation for this series in this range.');
      message_.replaceChildren(glyph('M4 19V5m0 14h16M8 14l4-5 4 3 4-7'), el('strong', { text: 'No observations' }), el('span', { text: copy }),
        ...(loadRange ? [el('button', { class: 'mhc__retry', type: 'button', text: 'Try again', onclick: () => { bought.delete(series?.name); setRange(range.id); } })] : []));
      return;
    }
    const values = rows.map(row => row.value);
    const min = Math.min(...values), max = Math.max(...values);
    const pad = (max - min || Math.abs(max) * .02 || 1) * .13;
    const low = min - pad, high = max + pad;
    const x = index => left + index / (rows.length - 1) * w;
    const y = number => top + (high - number) / (high - low) * h;
    const defs = svg('defs');
    const clipPath = svg('clipPath', { id: `${id}-clip` });
    // Six pixels of slack each side, so the markers on the first and last
    // observation are whole circles rather than halves against the edge.
    clipPath.append(svg('rect', { x: left - 6, y: top - 8, width: w + 12, height: h + 8 }));
    defs.append(clipPath);
    drawing.append(defs);
    for (let i = 0; i <= 4; i++) {
      const tick = high - (high - low) * i / 4;
      drawing.append(svg('line', { x1: left, x2: width - right, y1: y(tick), y2: y(tick), class: 'mhc__grid' }),
        svg('text', { x: width - right + 10, y: y(tick) + 4, class: 'mhc__axis' }, format(tick)));
    }
    const span = daysBetween(rows[0].date, rows.at(-1).date);
    const labelCount = Math.min(rows.length, width < 520 ? 3 : 6);
    for (let i = 0; i < labelCount; i++) {
      const index = labelCount === 1 ? 0 : Math.round(i / (labelCount - 1) * (rows.length - 1));
      drawing.append(svg('text', { x: x(index), y: height - 9, class: 'mhc__axis',
        'text-anchor': i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle' }, axisLabel(rows[index].date, span, series?.step)));
    }
    const chart = svg('g', { 'clip-path': `url(#${id}-clip)` });
    // A step line is the honest shape for a series that holds a level between
    // releases; a straight line between two quarters is a reading of the trend.
    const path = rows.map((row, index) => {
      const point = `${x(index).toFixed(2)} ${y(row.value).toFixed(2)}`;
      if (!index) return `M${point}`;
      return style === 'step' ? `H${x(index).toFixed(2)} V${y(row.value).toFixed(2)}` : `L${point}`;
    }).join(' ');
    chart.append(svg('path', { d: path, class: 'mhc__line emc__line', fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    // Markers while they can be told apart; past that they are a solid band.
    if (rows.length <= 45) rows.forEach((row, index) => chart.append(svg('circle', { cx: x(index), cy: y(row.value), r: 4.5, class: 'emc__point' })));
    drawing.append(chart);
    const last = rows.at(-1).value, lastY = y(last);
    drawing.append(svg('line', { x1: left, x2: width - right, y1: lastY, y2: lastY, class: 'mhc__last-line' }),
      svg('rect', { x: width - right + 3, y: lastY - 11, width: right - 5, height: 22, rx: 3, class: 'mhc__last-badge' }),
      svg('text', { x: width - right + (right - 2) / 2, y: lastY + 4, 'text-anchor': 'middle', class: 'mhc__last-text' }, format(last)));
    const cross = svg('g', { class: 'mhc__cross', visibility: 'hidden' });
    const vertical = svg('line', { y1: top, y2: top + h });
    const horizontal = svg('line', { x1: left, x2: width - right });
    const dot = svg('circle', { r: 4.5 });
    const dateBox = svg('rect', { y: height - bottom + 3, width: 130, height: 24, rx: 3, class: 'mhc__cross-date' });
    const dateText = svg('text', { y: height - bottom + 19, 'text-anchor': 'middle', class: 'mhc__cross-text' });
    cross.append(vertical, horizontal, dot, dateBox, dateText);
    drawing.append(cross);
    geometry = { width, x, y, left, w, cross, vertical, horizontal, dot, dateBox, dateText };
  }

  function inspect(index) {
    if (!geometry) return;
    const g = geometry;
    selected = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[selected], xx = g.x(selected), yy = g.y(row.value);
    g.cross.setAttribute('visibility', 'visible');
    g.vertical.setAttribute('x1', xx); g.vertical.setAttribute('x2', xx);
    g.horizontal.setAttribute('y1', yy); g.horizontal.setAttribute('y2', yy);
    g.dot.setAttribute('cx', xx); g.dot.setAttribute('cy', yy);
    const labelX = Math.max(65, Math.min(g.width - 65, xx));
    g.dateBox.setAttribute('x', labelX - 65);
    g.dateText.setAttribute('x', labelX);
    g.dateText.textContent = periodOf(row.date, series?.step);
    header(row);
  }

  function leave() {
    selected = -1;
    geometry?.cross.setAttribute('visibility', 'hidden');
    header();
  }
  plot.addEventListener('pointermove', event => {
    if (!geometry || rows.length < 2) return;
    const rect = plot.getBoundingClientRect();
    const xx = (event.clientX - rect.left) / rect.width * geometry.width;
    inspect(Math.round((xx - geometry.left) / geometry.w * (rows.length - 1)));
  });
  plot.addEventListener('pointerleave', leave);
  plot.addEventListener('blur', leave);
  plot.addEventListener('keydown', event => {
    if (!geometry || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') { leave(); return; }
    const position = selected < 0 ? rows.length - 1 : selected;
    inspect(event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
      : position + (event.key === 'ArrowLeft' ? -1 : 1));
    plot.setAttribute('aria-label', `${series?.label || ''}, ${periodOf(rows[selected].date, series?.step)}, ${format(rows[selected].value)}. Use arrow keys to read the series.`);
  });

  /* The same trade the quote chart makes: the chart moves into a modal and a
     comment holds its place, so expanding keeps the node — and its state — and
     returning it costs no reload. */
  function toggleExpand() {
    if (modal) { modal.close(); return; }
    placeholder = document.createComment('indicator-chart');
    root.replaceWith(placeholder);
    modal = el('dialog', { class: 'mhc-modal', 'aria-label': `${series?.label || 'Indicator'} expanded chart` });
    const theme = getComputedStyle(placeholder.parentElement || document.documentElement);
    for (const token of ['--mh-bg', '--mh-fg', '--mh-muted', '--mh-border', '--mh-blue']) {
      const token_ = theme.getPropertyValue(token).trim();
      if (token_) modal.style.setProperty(token, token_);
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

  const resize = new ResizeObserver(() => { if (root.isConnected || modal) draw(); });
  resize.observe(plot);

  root.setSeries = entry => {
    if (dead || !entry) return;
    series = entry;
    warning = '';
    status = entry.status || 'ok';
    message = entry.message || '';
    request += 1;
    busy = false;
    if (entry.points?.length && !bought.has(entry.name)) bought.set(entry.name, { windows: entry.windows || 1, points: entry.points });
    // Open on the widest range already paid for: arriving spends nothing.
    const paid = bought.get(entry.name)?.windows || 1;
    range = [...RANGES].reverse().find(item => windowsFor(item) <= paid) || RANGES[0];
    sourceText();
    clip();
    syncRanges();
    header();
    draw();
  };
  root.destroy = () => {
    if (dead) return;
    dead = true;
    request += 1;
    resize.disconnect();
    if (modal) modal.close();
    bought.clear();
  };
  syncRanges();
  header();
  return root;
}


/**
 * The block: the rail, the chart under it, and the note that says what a range
 * costs. `loaded` is the map `loadUsIndicators()` returns; `refresh(map)` adds
 * the series the board buys later.
 */
export function economyIndicators(loaded = new Map(), { loadRange = null, status = 'ok' } = {}) {
  const order = US_INDICATORS.map(item => item.name);
  const root = el('section', { class: 'mh-chart-block emc-block', id: 'economy-chart', 'aria-label': 'United States indicator charts' });
  const railHost = el('div', { class: 'emc-block__rail' });
  const data = new Map(loaded);
  const chart = indicatorChart({ loadRange });
  let rail = null;
  let active = null;

  function entries() {
    return order.map(name => data.get(name) ? { ...US_INDICATORS.find(item => item.name === name), ...data.get(name) } : null)
      .filter(entry => entry && entry.status === 'ok' && entry.points?.length);
  }

  function buildRail() {
    const list = entries();
    rail?.dispose?.();
    if (!list.length) {
      railHost.replaceChildren();
      return list;
    }
    if (!active || !list.some(entry => entry.name === active)) active = list[0].name;
    const buttons = list.map(entry => {
      const chosen = entry.name === active;
      const button = el('button', {
        type: 'button', role: 'tab', class: `mh-quote-tab emc-tab${chosen ? ' is-active' : ''}`,
        'data-series': entry.name, 'aria-selected': String(chosen), tabindex: chosen ? '0' : '-1',
        'aria-label': `Chart ${entry.label}`, onclick: () => choose(entry.name),
      }, [
        countryFlag('US', { className: 'emc-tab__flag' }),
        el('span', { class: 'mh-quote-tab__text' }, [
          el('span', { class: 'mh-quote-tab__name', text: `US ${entry.label}` }),
          el('span', { class: 'mh-quote-tab__values' }, [
            el('span', { class: 'mh-price', text: indicatorValue(entry.latest?.value, entry.unit) }),
            el('small', { class: 'emc-tab__period', text: periodOf(entry.latest?.date, entry.step) }),
          ]),
        ]),
      ]);
      button.addEventListener('keydown', event => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = list.findIndex(item => item.name === entry.name);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
        choose(list[next].name);
        railHost.querySelector(`[data-series="${list[next].name}"]`)?.focus();
      });
      return button;
    });
    rail = carousel(buttons, { label: 'United States indicator series', className: 'mh-quote-tabs emc-rail' });
    rail.querySelector('.mh-rail').setAttribute('role', 'tablist');
    railHost.replaceChildren(rail);
    return list;
  }

  function choose(name) {
    active = name;
    for (const button of railHost.querySelectorAll('.emc-tab')) {
      const chosen = button.dataset.series === name;
      button.classList.toggle('is-active', chosen);
      button.setAttribute('aria-selected', String(chosen));
      button.tabIndex = chosen ? 0 : -1;
    }
    const entry = entries().find(item => item.name === name);
    if (entry) chart.setSeries(entry);
  }

  function drawAll() {
    const list = buildRail();
    if (!list.length) {
      root.replaceChildren(el('p', { class: 'emc-block__none', text: status === 'skipped'
        ? 'Connect your FMP API key in Settings to chart the US indicator series.'
        : 'FMP returned no observations to chart for these series.' }));
      return;
    }
    root.replaceChildren(railHost, chart, el('p', { class: 'emc-block__note', text:
      `FMP answers one series per request and clips any window wider than ${INDICATOR_WINDOW_DAYS} days, so a range is bought a window at a time — ten years of one series is ${requestNote(windowsFor(rangeOf('10Y')))}. Each range opens on what is already loaded, and every window is cached for ten minutes.` }));
    choose(active);
  }

  drawAll();
  root.refresh = next => {
    for (const [name, entry] of next) data.set(name, entry);
    drawAll();
  };
  root.destroy = () => { chart.destroy?.(); rail?.dispose?.(); };
  root.dispose = root.destroy;
  return root;
}
