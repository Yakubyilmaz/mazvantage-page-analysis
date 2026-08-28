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
        rx: 2, fill: s.color,
        opacity: isForecast ? 0.55 : 1,
        stroke: isForecast ? s.color : null,
        'stroke-dasharray': isForecast ? '3 2' : null,
      });
      bindTip(rect, () => `<b>${cat}</b><span class="k">${s.name}: </span>${valueFmt(v)}`);
      g.append(rect);
    });
  });

  g.append(svgEl('line', { x1: x0, x2: x1, y1: zero, y2: zero, stroke: 'var(--chart-axis)', 'stroke-width': 1 }));

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
