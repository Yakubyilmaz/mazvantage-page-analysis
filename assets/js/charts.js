/* ==========================================================================
   Maz Vantage — SVG chart primitives

   No chart library. Each function returns a detached <svg> sized by a fixed
   viewBox and stretched with width:100%, so charts stay crisp at any column
   width and print cleanly.

   Colours come from CSS custom properties, so every chart follows the theme.
   ========================================================================== */

import { isNum, money, pct, price, trim, fmtDate, yearOf } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 760;                       // viewBox width every chart shares

let uid = 0;
const nextId = (p) => `mv-${p}-${++uid}`;

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

function frame(height, cls = '') {
  return svgEl('svg', {
    class: `chart ${cls}`.trim(),
    viewBox: `0 0 ${W} ${height}`,
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  });
}

/* ---------- scales -------------------------------------------------------- */

const linear = (d0, d1, r0, r1) => (v) => {
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
};

/** Round a domain out to friendly tick values. */
function niceDomain(min, max, ticks = 5) {
  if (!isNum(min) || !isNum(max)) return { lo: 0, hi: 1, step: 0.25 };
  if (min === max) { min -= Math.abs(min || 1) * 0.1; max += Math.abs(max || 1) * 0.1; }
  const span = max - min;
  const raw = span / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

function ticksOf({ lo, hi, step }) {
  const out = [];
  for (let v = lo; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/* ---------- tooltip ------------------------------------------------------- */

let tipNode = null;
function tip() {
  if (!tipNode) {
    tipNode = document.createElement('div');
    tipNode.className = 'tip';
    document.body.append(tipNode);
  }
  return tipNode;
}

function bindTip(node, htmlFn) {
  node.style.cursor = 'default';
  node.addEventListener('pointerenter', (e) => {
    const t = tip();
    t.innerHTML = htmlFn();
    t.classList.add('on');
    moveTip(e);
  });
  node.addEventListener('pointermove', moveTip);
  node.addEventListener('pointerleave', () => tip().classList.remove('on'));
}

function moveTip(e) {
  const t = tip();
  const pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = t.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

/* ---------- shared chrome ------------------------------------------------- */

function yAxis(g, scale, domain, { fmt = (v) => trim(v, 1), x0, x1, labelX }) {
  const grid = svgEl('g', { class: 'grid' });
  const axis = svgEl('g', { class: 'axis' });
  for (const v of ticksOf(domain)) {
    const y = scale(v);
    grid.append(svgEl('line', { x1: x0, x2: x1, y1: y, y2: y }));
    axis.append(svgEl('text', {
      x: labelX, y: y + 4, 'text-anchor': 'end', 'font-size': 11,
    }, fmt(v)));
  }
  g.append(grid, axis);
}

/* ==========================================================================
   Line / area chart — price history
   ========================================================================== */

export function lineChart(series, {
  height = 260,
  color = 'var(--brand-01)',
  fill = true,
  valueFmt = (v) => price(v),
  labelFmt = (d) => fmtDate(d),
  pad = { t: 12, r: 16, b: 26, l: 56 },
} = {}) {
  const svg = frame(height);
  const pts = series.filter((p) => isNum(p.value));
  if (pts.length < 2) return empty(svg, height, 'Not enough price history');

  const x0 = pad.l, x1 = W - pad.r, y0 = height - pad.b, y1 = pad.t;
  const values = pts.map((p) => p.value);
  const dom = niceDomain(Math.min(...values), Math.max(...values), 4);
  const sx = linear(0, pts.length - 1, x0, x1);
  const sy = linear(dom.lo, dom.hi, y0, y1);

  const g = svgEl('g');
  yAxis(g, sy, dom, { fmt: (v) => valueFmt(v), x0, x1, labelX: x0 - 8 });

  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(2)},${sy(p.value).toFixed(2)}`).join('');

  if (fill) {
    const gid = nextId('grad');
    const defs = svgEl('defs', {}, [
      svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, [
        svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.28 }),
        svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }),
      ]),
    ]);
    g.append(defs);
    g.append(svgEl('path', { d: `${d}L${sx(pts.length - 1)},${y0}L${x0},${y0}Z`, fill: `url(#${gid})` }));
  }
  g.append(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));

  // x labels: first, middle, last
  const marks = [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
  const ax = svgEl('g', { class: 'axis' });
  marks.forEach((i, k) => {
    ax.append(svgEl('text', {
      x: sx(i), y: height - 8, 'font-size': 11,
      'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle',
    }, labelFmt(pts[i].date)));
  });
  g.append(ax);

  // hover crosshair
  const hover = svgEl('g', { opacity: 0 });
  const vline = svgEl('line', { y1, y2: y0, stroke: 'var(--chart-axis)', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
  const dot = svgEl('circle', { r: 4, fill: color, stroke: 'var(--surface-1)', 'stroke-width': 2 });
  hover.append(vline, dot);
  g.append(hover);

  const hit = svgEl('rect', { x: x0, y: y1, width: x1 - x0, height: y0 - y1, fill: 'transparent' });
  hit.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const rel = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(linear(x0, x1, 0, pts.length - 1)(Math.max(x0, Math.min(x1, rel))));
    const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
    if (!p) return;
    hover.setAttribute('opacity', 1);
    vline.setAttribute('x1', sx(i)); vline.setAttribute('x2', sx(i));
    dot.setAttribute('cx', sx(i)); dot.setAttribute('cy', sy(p.value));
    const t = tip();
    t.innerHTML = `<b>${valueFmt(p.value)}</b><span class="k">${labelFmt(p.date)}</span>`;
    t.classList.add('on');
    moveTip(e);
  });
  hit.addEventListener('pointerleave', () => { hover.setAttribute('opacity', 0); tip().classList.remove('on'); });
  g.append(hit);

  svg.append(g);
  return svg;
}

/* ==========================================================================
   Column chart — supports several series, grouped or stacked, plus a
   dashed "forecast" region.
   ========================================================================== */

export function columnChart(categories, series, {
  height = 280,
  stacked = false,
  valueFmt = (v) => money(v),
  forecastFrom = null,               // index at which bars become forecasts
  refLine = null,                    // { value, label } drawn across the plot
  pad = { t: 16, r: 16, b: 34, l: 62 },
  legend = true,
} = {}) {
  const svg = frame(height);
  if (!categories.length || !series.length) return empty(svg, height, 'No data');

  const x0 = pad.l, x1 = W - pad.r, y0 = height - pad.b, y1 = pad.t;

  let lo = 0, hi = 0;
  if (stacked) {
    categories.forEach((_, i) => {
      const posSum = series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0);
      const negSum = series.reduce((a, s) => a + Math.min(0, s.values[i] ?? 0), 0);
      hi = Math.max(hi, posSum); lo = Math.min(lo, negSum);
    });
  } else {
    for (const s of series) for (const v of s.values) {
      if (!isNum(v)) continue;
      hi = Math.max(hi, v); lo = Math.min(lo, v);
    }
  }
  // The reference line has to fit inside the plot or it is drawn off it.
  if (refLine && isNum(refLine.value)) {
    hi = Math.max(hi, refLine.value);
    lo = Math.min(lo, refLine.value);
  }
  const dom = niceDomain(lo, hi, 4);
  const sy = linear(dom.lo, dom.hi, y0, y1);
  const zero = sy(0);

  const g = svgEl('g');
  yAxis(g, sy, dom, { fmt: (v) => valueFmt(v), x0, x1, labelX: x0 - 8 });

  const slot = (x1 - x0) / categories.length;
  const groupW = slot * 0.66;
  const barW = stacked ? groupW : groupW / series.length;

  if (isNum(forecastFrom) && forecastFrom < categories.length) {
    const fx = x0 + slot * forecastFrom;
    g.append(svgEl('rect', {
      x: fx, y: y1, width: x1 - fx, height: y0 - y1,
      fill: 'var(--chart-grid)', opacity: 0.5,
    }));
    g.append(svgEl('text', { x: fx + 6, y: y1 + 12, 'font-size': 10 }, 'forecast'));
  }

  categories.forEach((cat, i) => {
    const cx = x0 + slot * i + (slot - groupW) / 2;
    let stackPos = 0, stackNeg = 0;
    series.forEach((s, k) => {
      const v = s.values[i];
      if (!isNum(v)) return;
      let y, h, bx;
      if (stacked) {
        bx = cx;
        if (v >= 0) { y = sy(stackPos + v); h = sy(stackPos) - y; stackPos += v; }
        else { y = sy(stackNeg); h = sy(stackNeg + v) - y; stackNeg += v; }
      } else {
        bx = cx + barW * k;
        y = v >= 0 ? sy(v) : zero;
        h = Math.abs(sy(v) - zero);
      }
      const isForecast = isNum(forecastFrom) && i >= forecastFrom;
      const rect = svgEl('rect', {
        x: bx, y, width: Math.max(barW - 1.5, 1), height: Math.max(h, 1),
        // `colors` singles out one bar inside a series — the company among its
        // peers — without splitting it into two series and halving every bar.
        rx: 2, fill: (s.colors && s.colors[i]) || s.color,
        opacity: isForecast ? 0.55 : 1,
        stroke: isForecast ? s.color : null,
        'stroke-dasharray': isForecast ? '3 2' : null,
      });
      bindTip(rect, () => `<b>${cat}</b><span class="k">${s.name}: </span>${valueFmt(v)}`);
      g.append(rect);
    });
  });

  g.append(svgEl('line', { x1: x0, x2: x1, y1: zero, y2: zero, stroke: 'var(--chart-axis)', 'stroke-width': 1 }));

  if (refLine && isNum(refLine.value)) {
    const ry = sy(refLine.value);
    g.append(svgEl('line', {
      x1: x0, x2: x1, y1: ry, y2: ry,
      stroke: refLine.color || 'var(--text-softer)', 'stroke-width': 1, 'stroke-dasharray': '4 3',
    }));
    if (refLine.label) {
      // `align` picks the end of the line with room above it. On a chart sorted
      // ascending that is the left, where the shortest bars are; the default
      // right-hand placement would sit on top of the tallest one.
      const atStart = refLine.align === 'start';
      g.append(svgEl('text', {
        x: atStart ? x0 + 4 : x1, y: ry - 6,
        'text-anchor': atStart ? 'start' : 'end', 'font-size': 11,
        fill: refLine.color || 'var(--text-softer)',
      }, refLine.label));
    }
  }

  const ax = svgEl('g', { class: 'axis' });
  const every = Math.ceil(categories.length / 12);
  categories.forEach((c, i) => {
    if (i % every) return;
    ax.append(svgEl('text', {
      x: x0 + slot * i + slot / 2, y: height - 12, 'font-size': 11, 'text-anchor': 'middle',
    }, c));
  });
  g.append(ax);

  svg.append(g);
  const wrap = document.createElement('div');
  wrap.append(svg);
  if (legend) wrap.append(legendFor(series));
  return wrap;
}

function legendFor(series) {
  const l = document.createElement('div');
  l.className = 'legend';
  for (const s of series) {
    const sp = document.createElement('span');
    sp.innerHTML = `<i style="background:${s.color}"></i>${s.name}`;
    l.append(sp);
  }
  return l;
}

/* ==========================================================================
   Waterfall — how revenue becomes earnings

   Each step is either a `total` (a bar standing on zero: revenue, gross
   profit, earnings) or a `delta` (a bar floating between the running total
   and the next one: the costs subtracted along the way). Dashed connectors
   carry the running total from one bar to the next, which is what makes the
   subtraction legible rather than a row of unrelated bars.

   steps: [{ label, value, kind: 'total'|'delta', color? }]
   A delta's value is signed — pass costs as negatives.
   ========================================================================== */

export function waterfallChart(steps, {
  height = 300,
  valueFmt = (v) => money(v),
  pad = { t: 30, r: 16, b: 42, l: 70 },
  /* Step names here are the longest axis labels in the report ("Cost of
     revenue", "Other expenses"). Below this the shared 760-unit viewBox
     scales them past legibility, so the chart scrolls instead of shrinking. */
  minWidth = 520,
} = {}) {
  const svg = frame(height);

  // Resolve every bar's span before scaling: a delta hangs off wherever the
  // running total had reached, a total is measured from zero.
  const scroller = (node) => {
    const wrap = document.createElement('div');
    wrap.className = 'chart-scroll';
    node.style.minWidth = `${minWidth}px`;
    wrap.append(node);
    return wrap;
  };

  let running = 0;
  const bars = [];
  for (const s of steps) {
    if (!isNum(s.value)) continue;
    const isTotal = s.kind === 'total';
    const from = isTotal ? 0 : running;
    const to = isTotal ? s.value : running + s.value;
    running = to;
    bars.push({ ...s, from, to, isTotal });
  }
  if (bars.length < 2) return empty(svg, height, 'Not enough of the income statement to chart');

  const x0 = pad.l, x1 = W - pad.r, y0 = height - pad.b, y1 = pad.t;

  let lo = 0, hi = 0;
  for (const b of bars) {
    lo = Math.min(lo, b.from, b.to);
    hi = Math.max(hi, b.from, b.to);
  }
  const dom = niceDomain(lo, hi, 4);
  const sy = linear(dom.lo, dom.hi, y0, y1);

  const g = svgEl('g');
  yAxis(g, sy, dom, { fmt: (v) => valueFmt(v), x0, x1, labelX: x0 - 8 });

  const slot = (x1 - x0) / bars.length;
  const barW = Math.min(slot * 0.58, 96);
  const leftOf = (i) => x0 + slot * i + (slot - barW) / 2;

  bars.forEach((b, i) => {
    const bx = leftOf(i);
    const yTop = sy(Math.max(b.from, b.to));
    const yBot = sy(Math.min(b.from, b.to));
    const h = Math.max(yBot - yTop, 1);

    const color = b.color
      || (b.isTotal ? 'var(--chart-01)' : b.value < 0 ? 'var(--bad)' : 'var(--good)');

    const rect = svgEl('rect', { x: bx, y: yTop, width: barW, height: h, rx: 2, fill: color });
    bindTip(rect, () => `<b>${b.label}</b>`
      + `<span class="k">${b.isTotal ? 'running total: ' : 'change: '}</span>`
      + `${valueFmt(b.isTotal ? b.to : b.value)}`);
    g.append(rect);

    // The figure sits above the bar, which is where the eye lands first.
    g.append(svgEl('text', {
      x: bx + barW / 2, y: yTop - 9, 'text-anchor': 'middle',
      'font-size': 11, 'font-weight': 600, fill: 'var(--text-soft)',
    }, valueFmt(b.isTotal ? b.to : b.value)));

    // Connector to the next bar, drawn at the running total they share.
    if (i < bars.length - 1) {
      const y = sy(b.to);
      g.append(svgEl('line', {
        x1: bx + barW, x2: leftOf(i + 1), y1: y, y2: y,
        stroke: 'var(--chart-axis)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.55,
      }));
    }
  });

  g.append(svgEl('line', {
    x1: x0, x2: x1, y1: sy(0), y2: sy(0), stroke: 'var(--chart-axis)', 'stroke-width': 1,
  }));

  const ax = svgEl('g', { class: 'axis' });
  bars.forEach((b, i) => {
    ax.append(svgEl('text', {
      x: leftOf(i) + barW / 2, y: height - 14, 'text-anchor': 'middle', 'font-size': 11,
    }, b.label));
  });
  g.append(ax);

  svg.append(g);
  return scroller(svg);
}

/* ==========================================================================
   Combined history + forecast line chart (earnings & revenue outlook)
   ========================================================================== */

export function forecastChart(points, series, {
  height = 290,
  valueFmt = (v) => money(v),
  splitAt = null,                   // index where actuals end and forecast starts
  pad = { t: 18, r: 16, b: 32, l: 64 },
} = {}) {
  const svg = frame(height);
  if (points.length < 2) return empty(svg, height, 'Not enough data to plot a forecast');

  const x0 = pad.l, x1 = W - pad.r, y0 = height - pad.b, y1 = pad.t;
  const all = series.flatMap((s) => s.values.filter(isNum));
  const bandLo = series.flatMap((s) => (s.low || []).filter(isNum));
  const bandHi = series.flatMap((s) => (s.high || []).filter(isNum));
  const dom = niceDomain(Math.min(0, ...all, ...bandLo), Math.max(...all, ...bandHi), 4);
  const sx = linear(0, points.length - 1, x0, x1);
  const sy = linear(dom.lo, dom.hi, y0, y1);

  const g = svgEl('g');
  yAxis(g, sy, dom, { fmt: valueFmt, x0, x1, labelX: x0 - 8 });

  if (isNum(splitAt) && splitAt < points.length - 1) {
    const fx = sx(splitAt);
    g.append(svgEl('rect', { x: fx, y: y1, width: x1 - fx, height: y0 - y1, fill: 'var(--chart-grid)', opacity: 0.45 }));
    g.append(svgEl('line', { x1: fx, x2: fx, y1, y2: y0, stroke: 'var(--chart-axis)', 'stroke-dasharray': '4 3' }));
    g.append(svgEl('text', { x: fx + 6, y: y1 + 12, 'font-size': 10 }, 'analyst forecast'));
  }

  for (const s of series) {
    // uncertainty band
    if (s.low && s.high) {
      const idx = points.map((_, i) => i).filter((i) => isNum(s.low[i]) && isNum(s.high[i]));
      if (idx.length > 1) {
        const up = idx.map((i) => `${sx(i).toFixed(2)},${sy(s.high[i]).toFixed(2)}`);
        const dn = idx.slice().reverse().map((i) => `${sx(i).toFixed(2)},${sy(s.low[i]).toFixed(2)}`);
        g.append(svgEl('polygon', { points: [...up, ...dn].join(' '), fill: s.color, opacity: 0.14 }));
      }
    }
    // split the line so the forecast half is dashed
    const seg = (from, to, dash) => {
      const idx = points.map((_, i) => i).filter((i) => i >= from && i <= to && isNum(s.values[i]));
      if (idx.length < 2) return;
      const d = idx.map((i, k) => `${k ? 'L' : 'M'}${sx(i).toFixed(2)},${sy(s.values[i]).toFixed(2)}`).join('');
      g.append(svgEl('path', {
        d, fill: 'none', stroke: s.color, 'stroke-width': 2.2,
        'stroke-dasharray': dash ? '5 4' : null, 'stroke-linejoin': 'round',
      }));
    };
    if (isNum(splitAt)) { seg(0, splitAt, false); seg(splitAt, points.length - 1, true); }
    else seg(0, points.length - 1, false);

    points.forEach((p, i) => {
      if (!isNum(s.values[i])) return;
      const c = svgEl('circle', { cx: sx(i), cy: sy(s.values[i]), r: 3.4, fill: s.color });
      bindTip(c, () => `<b>${p}</b><span class="k">${s.name}: </span>${valueFmt(s.values[i])}`);
      g.append(c);
    });
  }

  const ax = svgEl('g', { class: 'axis' });
  const every = Math.ceil(points.length / 10);
  points.forEach((p, i) => {
    if (i % every && i !== points.length - 1) return;
    ax.append(svgEl('text', { x: sx(i), y: height - 10, 'font-size': 11, 'text-anchor': 'middle' }, p));
  });
  g.append(ax);

  svg.append(g);
  const wrap = document.createElement('div');
  wrap.append(svg, legendFor(series));
  return wrap;
}

/* ==========================================================================
   Range bar — analyst price targets against the current price
   ========================================================================== */

export function rangeChart({ low, avg, high, current, currency = 'US$' }, { height = 132 } = {}) {
  const svg = frame(height);
  if (![low, high, current].every(isNum)) return empty(svg, height, 'No analyst target range available');

  const pad = 60;
  const lo = Math.min(low, current) * 0.96;
  const hi = Math.max(high, current) * 1.04;
  const sx = linear(lo, hi, pad, W - pad);
  const yBar = 56;

  const g = svgEl('g');
  g.append(svgEl('rect', { x: pad, y: yBar, width: W - pad * 2, height: 10, rx: 5, fill: 'var(--surface-3)' }));
  g.append(svgEl('rect', { x: sx(low), y: yBar, width: Math.max(sx(high) - sx(low), 2), height: 10, rx: 5, fill: 'var(--chart-01)', opacity: 0.55 }));

  const marker = (x, color, label, value, above) => {
    const grp = svgEl('g');
    grp.append(svgEl('line', { x1: x, x2: x, y1: above ? yBar - 16 : yBar + 10, y2: above ? yBar : yBar + 26, stroke: color, 'stroke-width': 2 }));
    grp.append(svgEl('circle', { cx: x, cy: yBar + 5, r: 5, fill: color, stroke: 'var(--surface-1)', 'stroke-width': 2 }));
    grp.append(svgEl('text', {
      x, y: above ? yBar - 22 : yBar + 40, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--text-softer)',
    }, label));
    grp.append(svgEl('text', {
      x, y: above ? yBar - 36 : yBar + 54, 'text-anchor': 'middle', 'font-size': 12,
      fill: 'var(--text-solid)', 'font-weight': 600,
    }, price(value, currency)));
    return grp;
  };

  g.append(marker(sx(low), 'var(--text-softer)', 'Low', low, false));
  g.append(marker(sx(high), 'var(--text-softer)', 'High', high, false));
  if (isNum(avg)) g.append(marker(sx(avg), 'var(--chart-01)', 'Consensus', avg, true));
  g.append(marker(sx(current), 'var(--brand-01)', 'Current', current, true));

  svg.append(g);
  return svg;
}

/* ==========================================================================
   Fair-value bar — current price against an intrinsic estimate
   ========================================================================== */

export function fairValueChart({ current, fair, currency = 'US$' }, { height = 150 } = {}) {
  const svg = frame(height);
  if (!isNum(current) || !isNum(fair)) return empty(svg, height, 'No fair value estimate available');

  const pad = { l: 108, r: 24, t: 24 };
  const max = Math.max(current, fair) * 1.12;
  const sx = linear(0, max, pad.l, W - pad.r);
  const rowH = 40, barH = 26;
  const over = current > fair;

  const g = svgEl('g');
  [['Current price', current, 'var(--brand-01)'], ['Fair value', fair, over ? 'var(--bad)' : 'var(--good)']]
    .forEach(([label, v, color], i) => {
      const y = pad.t + i * rowH;
      g.append(svgEl('text', { x: pad.l - 12, y: y + barH / 2 + 4, 'text-anchor': 'end', 'font-size': 12 }, label));
      g.append(svgEl('rect', { x: pad.l, y, width: Math.max(sx(v) - pad.l, 2), height: barH, rx: 4, fill: color }));
      g.append(svgEl('text', {
        x: sx(v) + 10, y: y + barH / 2 + 4, 'font-size': 12,
        fill: 'var(--text-solid)', 'font-weight': 600,
      }, price(v, currency)));
    });

  const gap = Math.abs(current / fair - 1);
  g.append(svgEl('text', {
    x: pad.l, y: pad.t + rowH * 2 + 22, 'font-size': 13,
    fill: over ? 'var(--bad)' : 'var(--good)', 'font-weight': 600,
  }, `${pct(gap)} ${over ? 'overvalued' : 'undervalued'}`));

  svg.append(g);
  return svg;
}

/* ==========================================================================
   Multi-line chart — two or more quantities sharing one axis over time

   `lineChart` above draws a single price series with a filled area. This one
   is for comparing levels: several named series on one scale, no fill, a dot
   at every observation. It is the right shape wherever the question is "which
   of these moved, and did they move together" rather than "what did this do".
   ========================================================================== */

export function multiLineChart(series, {
  height = 260,
  valueFmt = (v) => money(v),
  labelFmt = (d) => String(yearOf(d)),
  pad = { t: 16, r: 20, b: 34, l: 64 },
} = {}) {
  const svg = frame(height);
  const live = series.filter((s) => (s.points || []).some((p) => isNum(p.value)));
  if (!live.length) return empty(svg, height, 'No history to chart');

  const dates = live[0].points.map((p) => p.date);
  const n = dates.length;
  if (n < 2) return empty(svg, height, 'Not enough history to chart');

  const all = live.flatMap((s) => s.points.map((p) => p.value)).filter(isNum);
  // Zero is included on purpose: these are levels, so the distance from
  // nothing is part of the reading, and a clipped axis would exaggerate every
  // wobble in a line that never goes near it.
  const dom = niceDomain(Math.min(0, ...all), Math.max(...all), 4);

  const x0 = pad.l, x1 = W - pad.r, y0 = height - pad.b, y1 = pad.t;
  const sx = (i) => x0 + ((x1 - x0) * i) / (n - 1);
  const sy = linear(dom.lo, dom.hi, y0, y1);

  const g = svgEl('g');
  yAxis(g, sy, dom, { fmt: valueFmt, x0, x1, labelX: x0 - 8 });

  for (const s of live) {
    const pts = s.points.map((p, i) => (isNum(p.value) ? [sx(i), sy(p.value)] : null)).filter(Boolean);
    if (pts.length < 2) continue;
    g.append(svgEl('path', {
      d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' '),
      fill: 'none', stroke: s.color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    s.points.forEach((p, i) => {
      if (!isNum(p.value)) return;
      const dot = svgEl('circle', {
        cx: sx(i), cy: sy(p.value), r: 3.5, fill: s.color,
        stroke: 'var(--surface-1)', 'stroke-width': 1.5,
      });
      bindTip(dot, () => `<b>${labelFmt(p.date)}</b><br><span class="k">${s.name}: </span>${valueFmt(p.value)}`);
      g.append(dot);
    });
  }

  const ax = svgEl('g', { class: 'axis' });
  const every = Math.ceil(n / 10);
  dates.forEach((d, i) => {
    if (i % every) return;
    ax.append(svgEl('text', {
      x: sx(i), y: height - 12, 'font-size': 11, 'text-anchor': 'middle',
    }, labelFmt(d)));
  });
  g.append(ax);

  svg.append(g);
  const wrap = document.createElement('div');
  wrap.append(svg, legendFor(live));
  return wrap;
}

/* ==========================================================================
   Sankey — where a total splits, and what it splits into

   No library. Nodes are placed in explicit columns by the caller; the layout
   only has to size them and route the ribbons, because a financial statement
   already knows its own left-to-right order and letting an algorithm reorder
   it would scramble the reading.

   A node's height is the larger of what flows in and what flows out. For a
   statement those are equal by construction — that is what makes it a
   statement — so any visible mismatch is a data problem worth seeing rather
   than one worth hiding.

     nodes: [{ id, label, layer, color }]
     links: [{ from, to, value }]
   ========================================================================== */

export function sankeyChart({ nodes, links }, { height = 300, fmt = (v) => money(v) } = {}) {
  const svg = frame(height, 'chart--sankey');
  const live = links.filter((l) => isNum(l.value) && l.value > 0);
  if (!live.length) return empty(svg, height, 'Not enough of the statement is published to draw this');

  const byId = new Map(nodes.map((n) => [n.id, { ...n, in: 0, out: 0 }]));
  for (const l of live) {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b) continue;
    a.out += l.value;
    b.in += l.value;
  }
  for (const n of byId.values()) n.total = Math.max(n.in, n.out);

  const layers = [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b);
  const cols = layers.map((L) => [...byId.values()].filter((n) => n.layer === L && n.total > 0));
  if (!cols.some((c) => c.length)) return empty(svg, height, 'Nothing to chart');

  const pad = { t: 22, b: 22, l: 4, r: 4 };
  const NODE_W = 13;
  // Enough vertical air for a two-line label beside each node without the
  // value of one colliding with the name of the next one down.
  const GAP = 28;
  const usable = height - pad.t - pad.b;

  // One scale for every column, set by the fullest one, so a bar's height is
  // comparable across the whole diagram rather than per column.
  let scale = Infinity;
  for (const col of cols) {
    if (!col.length) continue;
    const sum = col.reduce((t, n) => t + n.total, 0);
    const room = usable - GAP * (col.length - 1);
    if (room > 0 && sum > 0) scale = Math.min(scale, room / sum);
  }
  if (!isFinite(scale) || scale <= 0) return empty(svg, height, 'Nothing to chart');

  const colX = (i) => {
    if (layers.length === 1) return pad.l;
    const span = W - pad.l - pad.r - NODE_W;
    return pad.l + (span * i) / (layers.length - 1);
  };

  cols.forEach((col, i) => {
    const sum = col.reduce((t, n) => t + n.total, 0);
    let y = pad.t + (usable - (sum * scale + GAP * (col.length - 1))) / 2;
    for (const n of col) {
      n.x = colX(i);
      n.y = y;
      n.h = Math.max(n.total * scale, 1.5);
      n.inCursor = n.y;
      n.outCursor = n.y;
      y += n.h + GAP;
    }
  });

  const g = svgEl('g');
  const ribbons = svgEl('g');

  // Ribbons first, so the node bars and their labels sit over the joins.
  for (const l of live) {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b || !isNum(a.x) || !isNum(b.x)) continue;

    const h = l.value * scale;
    const y0 = a.outCursor;
    const y1 = b.inCursor;
    a.outCursor += h;
    b.inCursor += h;

    const x0 = a.x + NODE_W;
    const x1 = b.x;
    const mx = (x0 + x1) / 2;
    const d = `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`
      + ` L${x1},${y1 + h} C${mx},${y1 + h} ${mx},${y0 + h} ${x0},${y0 + h} Z`;

    const path = svgEl('path', { d, fill: b.color || a.color || 'var(--chart-01)', opacity: 0.3 });
    bindTip(path, () => `<b>${a.label} → ${b.label}</b><br>${fmt(l.value)}`);
    path.addEventListener('pointerenter', () => path.setAttribute('opacity', '0.55'));
    path.addEventListener('pointerleave', () => path.setAttribute('opacity', '0.3'));
    ribbons.append(path);
  }
  g.append(ribbons);

  for (const n of byId.values()) {
    if (!isNum(n.x)) continue;
    const rect = svgEl('rect', {
      x: n.x, y: n.y, width: NODE_W, height: n.h, rx: 2,
      fill: n.color || 'var(--chart-01)',
    });
    bindTip(rect, () => `<b>${n.label}</b><br>${fmt(n.total)}`);
    g.append(rect);

    // Beside the bar and vertically centred, never above and below it: a
    // stacked column would otherwise run one node's value into the next one's
    // name. The last column reads inward for the same reason the others read
    // outward — there is no canvas to its right.
    const last = n.layer === layers[layers.length - 1];
    const anchor = last ? 'end' : 'start';
    const lx = last ? n.x - 7 : n.x + NODE_W + 7;
    const cy = n.y + n.h / 2;

    g.append(svgEl('text', {
      x: lx, y: cy - 2, 'text-anchor': anchor, 'font-size': 11, fill: 'var(--text-soft)',
    }, n.label));
    g.append(svgEl('text', {
      x: lx, y: cy + 11, 'text-anchor': anchor, 'font-size': 11,
      'font-weight': 600, fill: 'var(--text-solid)',
    }, fmt(n.total)));
  }

  svg.append(g);
  return svg;
}

/* ==========================================================================
   Percentile strip — one subtopic's ratios at a glance

   A block of eight ratios is eight rank bars that all look alike, and the
   pattern across them is the thing a reader actually wants: are they all
   expensive, or is one dragging the rest? Every ratio goes on one axis of
   sector percentile, so the spread and the outliers read in a glance.

   The axis runs cheap to dear because that is the direction the grade runs:
   `pctile` here is already the graded percentile, inverted for the ratios
   where low is good, so 100 is always the good end.
   ========================================================================== */

export function percentileStrip(rows, { height = 96 } = {}) {
  const svg = frame(height, 'chart--strip');
  const live = rows.filter((r) => isNum(r.pctile));
  if (!live.length) return empty(svg, height, 'Nothing here could be ranked against the sector');

  const pad = { l: 56, r: 56, t: 30, b: 30 };
  const sx = linear(0, 1, pad.l, W - pad.r);
  const midY = pad.t + (height - pad.t - pad.b) / 2;
  const g = svgEl('g');

  // Track, median mark and the two ends.
  g.append(svgEl('line', {
    x1: pad.l, x2: W - pad.r, y1: midY, y2: midY,
    stroke: 'var(--border-soft)', 'stroke-width': 2, 'stroke-linecap': 'round',
  }));
  g.append(svgEl('line', {
    x1: sx(0.5), x2: sx(0.5), y1: midY - 16, y2: midY + 16,
    stroke: 'var(--text-subtle)', 'stroke-width': 1, 'stroke-dasharray': '3 3',
  }));
  g.append(svgEl('text', {
    x: sx(0.5), y: pad.t - 12, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--text-subtle)',
  }, 'sector median'));

  for (const [x, anchor, label] of [[pad.l, 'start', 'Weaker'], [W - pad.r, 'end', 'Stronger']]) {
    g.append(svgEl('text', {
      x, y: height - 8, 'text-anchor': anchor, 'font-size': 11, fill: 'var(--text-softer)',
    }, label));
  }

  // Lanes, so ratios that rank within a few points of each other stay legible
  // instead of stacking into one dot.
  const sorted = [...live].sort((a, b) => a.pctile - b.pctile);
  const lastX = [];
  const MIN_GAP = 26;
  for (const r of sorted) {
    const x = sx(r.pctile);
    let lane = 0;
    while (lane < 3 && isNum(lastX[lane]) && x - lastX[lane] < MIN_GAP) lane++;
    if (lane === 3) lane = 0;
    lastX[lane] = x;
    r._x = x;
    r._y = midY + (lane === 0 ? 0 : lane === 1 ? -13 : 13);
  }

  for (const r of sorted) {
    if (r._y !== midY) {
      g.append(svgEl('line', {
        x1: r._x, x2: r._x, y1: midY, y2: r._y,
        stroke: 'var(--border-soft)', 'stroke-width': 1,
      }));
    }
    const dot = svgEl('circle', {
      cx: r._x, cy: r._y, r: 5,
      fill: r.pctile >= 0.5 ? 'var(--good)' : 'var(--bad)',
      stroke: 'var(--surface-1)', 'stroke-width': 1.5,
    });
    bindTip(dot, () => `<b>${r.label}</b><br>${r.valueText ?? ''}${r.valueText ? ' · ' : ''}${r.rankText ?? ''}`);
    g.append(dot);
  }

  svg.append(g);
  return svg;
}

/* ==========================================================================
   Valuation range — the football field

   Every model that produced a number, on one price axis, against the market
   price. A single model is an opinion; the spread across all of them is the
   actual finding, and it is the one thing a picker showing one model at a
   time can never say. Where the models disagree is information too — a P/B
   answer far below a P/E answer says the value is not in the book.
   ========================================================================== */

export function valuationRangeChart(rows, { current, currency = 'US$' } = {}) {
  const rowH = 24;
  const pad = { l: 138, r: 30, t: 34, b: 32 };
  const height = pad.t + Math.max(rows.length, 1) * rowH + pad.b;
  const svg = frame(height, 'chart--range');
  if (!rows.length) return empty(svg, height, 'No model produced a fair value');

  const vals = rows.map((r) => r.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  // The axis starts at zero. These are prices, so the distance from nothing is
  // meaningful, and a clipped axis would exaggerate every gap on the chart.
  const dom = niceDomain(0, Math.max(hi, isNum(current) ? current : hi) * 1.06, 6);
  const sx = linear(dom.lo, dom.hi, pad.l, W - pad.r);
  const gridY = pad.t + rows.length * rowH;
  const g = svgEl('g');

  // Band across the models' own range, so the spread reads before any one dot.
  g.append(svgEl('rect', {
    x: sx(lo), y: pad.t, width: Math.max(sx(hi) - sx(lo), 1), height: rows.length * rowH,
    fill: 'var(--brand-01-subtle)', rx: 3,
  }));

  const sorted = [...vals].sort((a, b) => a - b);
  const mid = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  g.append(svgEl('line', {
    x1: sx(mid), x2: sx(mid), y1: pad.t, y2: gridY,
    stroke: 'var(--brand-01)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.75,
  }));

  const axis = svgEl('g', { class: 'axis' });
  for (const v of ticksOf(dom)) {
    axis.append(svgEl('line', {
      x1: sx(v), x2: sx(v), y1: pad.t, y2: gridY,
      stroke: 'var(--border-subtle)', 'stroke-width': 1,
    }));
    axis.append(svgEl('text', {
      x: sx(v), y: gridY + 16, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--text-softer)',
    }, money(v, { currency, dp: 0, plain: true })));
  }
  g.append(axis);

  rows.forEach((r, i) => {
    const y = pad.t + i * rowH + rowH / 2;
    const over = isNum(current) && current > r.value;
    const color = over ? 'var(--bad)' : 'var(--good)';

    g.append(svgEl('text', {
      x: pad.l - 12, y: y + 4, 'text-anchor': 'end', 'font-size': 11.5, fill: 'var(--text-soft)',
    }, r.label));

    // A leader line from the axis to the dot. Without it the eye cannot carry
    // a label across 400px of empty chart to the right dot.
    g.append(svgEl('line', {
      x1: pad.l, x2: sx(r.value), y1: y, y2: y,
      stroke: 'var(--border-soft)', 'stroke-width': 1,
    }));

    const dot = svgEl('circle', { cx: sx(r.value), cy: y, r: 5, fill: color });
    bindTip(dot, () => `<b>${r.full}</b><br>${price(r.value, currency)}`
      + (r.basisLabel ? `<br>target from ${r.basisLabel}` : '')
      + (isNum(r.target) ? ` — ${trim(r.target, 1)}x` : ''));
    g.append(dot);

    // The figure rides beside its dot, flipping to the inside near the right
    // edge so a model close to the axis maximum still reads.
    const near = sx(r.value) > W - pad.r - 78;
    g.append(svgEl('text', {
      x: sx(r.value) + (near ? -11 : 11), y: y + 4,
      'text-anchor': near ? 'end' : 'start',
      'font-size': 11.5, 'font-weight': 600, fill: color,
    }, price(r.value, currency)));
  });

  // The market price, last so it sits over the dots.
  if (isNum(current)) {
    const cx = sx(current);
    g.append(svgEl('line', {
      x1: cx, x2: cx, y1: pad.t - 8, y2: gridY + 4,
      stroke: 'var(--brand-01)', 'stroke-width': 2,
    }));
    const nearRight = cx > W - pad.r - 70;
    g.append(svgEl('text', {
      x: cx + (nearRight ? -8 : 8), y: pad.t - 14,
      'text-anchor': nearRight ? 'end' : 'start',
      'font-size': 11.5, 'font-weight': 600, fill: 'var(--brand-01)',
    }, `Price ${price(current, currency)}`));
  }

  svg.append(g);
  return svg;
}

/* ==========================================================================
   Radial gauge — ratios, payout, ROE
   ========================================================================== */

export function gauge(value, { min = 0, max = 1, label = '', fmt = (v) => pct(v), size = 168, bands = [] } = {}) {
  const svg = svgEl('svg', { class: 'chart', viewBox: '0 0 200 130', style: `width:${size}px;max-width:100%` });
  const cx = 100, cy = 104, r = 78;
  const clampV = Math.max(min, Math.min(max, isNum(value) ? value : min));
  const angle = (v) => Math.PI * (1 - (v - min) / (max - min));
  const pt = (v, rad = r) => [cx + rad * Math.cos(angle(v)), cy - rad * Math.sin(angle(v))];

  const arc = (from, to, rad, color, width) => {
    const [x1, y1] = pt(from, rad), [x2, y2] = pt(to, rad);
    const large = Math.abs(angle(from) - angle(to)) > Math.PI ? 1 : 0;
    return svgEl('path', {
      d: `M${x1},${y1}A${rad},${rad} 0 ${large} 1 ${x2},${y2}`,
      fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round',
    });
  };

  svg.append(arc(min, max, r, 'var(--surface-3)', 14));
  for (const b of bands) svg.append(arc(b.from, b.to, r, b.color, 14));
  if (isNum(value)) svg.append(arc(min, clampV, r, bands.length ? 'transparent' : 'var(--brand-01)', 14));

  if (isNum(value)) {
    const [nx, ny] = pt(clampV, r - 22);
    svg.append(svgEl('line', { x1: cx, y1: cy, x2: nx, y2: ny, stroke: 'var(--text-solid)', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    svg.append(svgEl('circle', { cx, cy, r: 6, fill: 'var(--text-solid)' }));
  }

  svg.append(svgEl('text', {
    x: cx, y: cy - 26, 'text-anchor': 'middle', 'font-size': 24,
    'font-weight': 700, fill: 'var(--text-solid)',
  }, isNum(value) ? fmt(value) : 'n/a'));
  if (label) svg.append(svgEl('text', { x: cx, y: cy + 20, 'text-anchor': 'middle', 'font-size': 11 }, label));

  return svg;
}

/* ==========================================================================
   Donut — ownership breakdown, balance-sheet composition
   ========================================================================== */

export function donut(slices, { size = 200, thickness = 34, centerLabel = '', centerValue = '' } = {}) {
  const svg = svgEl('svg', { class: 'chart', viewBox: '0 0 200 200', style: `width:${size}px;max-width:100%` });
  const total = slices.reduce((a, s) => a + (isNum(s.value) ? s.value : 0), 0);
  if (total <= 0) return empty(svg, 200, 'No breakdown available');

  const cx = 100, cy = 100, r = 82;
  let a0 = -Math.PI / 2;

  for (const s of slices) {
    if (!isNum(s.value) || s.value <= 0) continue;
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a, rad) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
    const ri = r - thickness;
    const path = svgEl('path', {
      d: `M${p(a0, r)}A${r},${r} 0 ${large} 1 ${p(a1, r)}L${p(a1, ri)}A${ri},${ri} 0 ${large} 0 ${p(a0, ri)}Z`,
      fill: s.color, stroke: 'var(--surface-1)', 'stroke-width': 1.5,
    });
    bindTip(path, () => `<b>${s.name}</b>${pct(s.value / total)} · ${s.display ?? money(s.value)}`);
    svg.append(path);
    a0 = a1;
  }

  if (centerValue) {
    svg.append(svgEl('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: 'var(--text-solid)' }, centerValue));
  }
  if (centerLabel) {
    svg.append(svgEl('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 10 }, centerLabel));
  }

  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.gap = '24px';
  wrap.style.alignItems = 'center';
  wrap.style.flexWrap = 'wrap';
  wrap.append(svg, legendFor(slices.map((s) => ({ name: `${s.name} — ${pct(s.value / total)}`, color: s.color }))));
  return wrap;
}

/* ==========================================================================
   Volatility strip — where this stock sits against market/industry
   ========================================================================== */

export function volatilityStrip({ stock, market, industry }, { height = 96 } = {}) {
  const svg = frame(height);
  const pad = 40;
  const vals = [stock, market, industry].filter(isNum);
  if (!vals.length) return empty(svg, height, 'No volatility data');
  const hi = Math.max(...vals) * 1.35;
  const sx = linear(0, hi, pad, W - pad);
  const y = 46;

  const gid = nextId('vol');
  svg.append(svgEl('defs', {}, [
    svgEl('linearGradient', { id: gid, x1: 0, x2: 1 }, [
      svgEl('stop', { offset: '0%', 'stop-color': 'var(--good)' }),
      svgEl('stop', { offset: '55%', 'stop-color': 'var(--neutral)' }),
      svgEl('stop', { offset: '100%', 'stop-color': 'var(--bad)' }),
    ]),
  ]));
  svg.append(svgEl('rect', { x: pad, y, width: W - pad * 2, height: 12, rx: 6, fill: `url(#${gid})`, opacity: 0.65 }));
  svg.append(svgEl('text', { x: pad, y: y - 10, 'font-size': 11 }, 'Low'));
  svg.append(svgEl('text', { x: W - pad, y: y - 10, 'font-size': 11, 'text-anchor': 'end' }, 'High'));

  const mark = (v, label, color, above) => {
    if (!isNum(v)) return;
    const x = Math.min(Math.max(sx(v), pad), W - pad);
    svg.append(svgEl('line', { x1: x, x2: x, y1: above ? y - 8 : y + 12, y2: above ? y : y + 22, stroke: color, 'stroke-width': 2 }));
    svg.append(svgEl('circle', { cx: x, cy: y + 6, r: 5.5, fill: color, stroke: 'var(--surface-1)', 'stroke-width': 2 }));
    svg.append(svgEl('text', {
      x, y: above ? y - 14 : y + 36, 'text-anchor': 'middle', 'font-size': 11,
      fill: color === 'var(--brand-01)' ? 'var(--text-solid)' : 'var(--text-softer)',
    }, `${label} ${pct(v)}`));
  };
  mark(market, 'Market', 'var(--text-softer)', false);
  mark(industry, 'Industry', 'var(--chart-01)', false);
  mark(stock, '', 'var(--brand-01)', true);

  return svg;
}

/* ---------- empty state --------------------------------------------------- */

function empty(svg, height, msg) {
  svg.append(svgEl('text', {
    x: W / 2, y: height / 2, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--text-subtle)',
  }, msg));
  return svg;
}

export { W as CHART_WIDTH };
