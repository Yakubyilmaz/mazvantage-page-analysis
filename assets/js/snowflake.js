/* ==========================================================================
   Maz Vantage — the Vantage Flake

   A five-axis radar where each spoke is one factor scored 0-5, continuously.
   The blob is a closed Catmull-Rom curve through the five score points, so a
   company with one strong factor reads as a spike and an all-round company
   reads as a pentagon.

   Geometry
   --------
   Spokes start at 12 o'clock and step 72 degrees clockwise:
     Value → Profitability → Growth → Momentum → Health
   Radius runs linearly from UNIT at a score of 0 to MAX_R at 5, so a zero
   still shows as a small nub rather than vanishing into the centre. Three
   rings mark scores 1.25, 3 and 4.75; a mask punches the spokes out of them,
   which is what gives the flake its segmented look.
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

export const AXES = [
  { key: 'valuation',     label: 'VALUE',         anchor: 'valuation' },
  { key: 'profitability', label: 'PROFITABILITY', anchor: 'profitability' },
  { key: 'growth',        label: 'GROWTH',        anchor: 'growth' },
  { key: 'momentum',      label: 'MOMENTUM',      anchor: 'momentum' },
  { key: 'health',        label: 'HEALTH',        anchor: 'financial-health' },
];

const CX = 170, CY = 145;
const UNIT = 17;                 // radius at a score of zero
const MAX_R = 119;               // radius at a score of five
const MAX_SCORE = 5;
const LABEL_R = 140;

let seq = 0;

function E(tag, attrs = {}, children = []) {
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

const angleOf = (i) => (-90 + i * 72) * Math.PI / 180;
const pointAt = (i, r) => [CX + r * Math.cos(angleOf(i)), CY + r * Math.sin(angleOf(i))];

const radiusFor = (score) =>
  UNIT + (Math.max(0, Math.min(MAX_SCORE, score ?? 0)) / MAX_SCORE) * (MAX_R - UNIT);

/** Decorative gradation rings, placed on the same scale as the blob. */
const RINGS = [1.25, 3, 4.75].map(radiusFor);

/** Closed Catmull-Rom through `pts`, emitted as cubic beziers. */
function smoothClosedPath(pts, tension = 1.15) {
  const n = pts.length;
  const at = (i) => pts[(i + n) % n];
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6 * tension, p1[1] + (p2[1] - p0[1]) / 6 * tension];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6 * tension, p2[1] - (p3[1] - p1[1]) / 6 * tension];
    d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)}, ${c2[0].toFixed(2)} ${c2[1].toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

/**
 * @param {object} scores  { valuation, profitability, growth, momentum, health } -> 0..5
 * @param {object} opts    { size, labels, interactive, onSelect, highlight }
 *
 * `highlight` is an axis key. Its label and score are drawn at full strength
 * and a dot is placed on its spoke, so the same flake repeated in each factor
 * section reads as "you are here" rather than as five identical pictures.
 */
export function snowflake(scores, {
  size = 190,
  labels = true,
  interactive = true,
  onSelect = null,
  highlight = null,
} = {}) {
  const id = `flake${++seq}`;
  const values = AXES.map((a) => (typeof scores?.[a.key] === 'number' ? scores[a.key] : null));

  const svg = E('svg', {
    // Padded well past the geometry: the axis labels sit outside the rings and
    // the longest of them ("PROFITABILITY") runs ~70 units past the right-hand
    // point. Without the margin they were clipped or spilled onto neighbours.
    viewBox: '-40 -14 420 336',
    width: size,
    // overflow:visible because the longest spoke label (PROFITABILITY) is set
    // at LABEL_R and runs past the 340-unit viewBox; an SVG root clips by
    // default, which was cutting it to "PROFITABILIT".
    style: `width:${size}px;max-width:100%;height:auto;overflow:visible`,
    role: 'img',
    'aria-label': `Vantage Flake: ${AXES.map((a, i) => `${a.label.toLowerCase()} ${values[i] == null ? 'not scored' : `${values[i].toFixed(2)} out of 5`}`).join(', ')}`,
  });

  /* ---- rings, with the spokes masked out ---- */
  const mask = E('mask', { id: `${id}-mask` }, [
    E('rect', { width: 340, height: 300, fill: 'white' }),
    ...AXES.map((_, i) => {
      const [x, y] = pointAt(i, MAX_R + 10);
      return E('line', { x1: CX, y1: CY, x2: x, y2: y, stroke: 'black', 'stroke-width': 5 });
    }),
  ]);
  svg.append(E('defs', {}, [mask]));

  const ringGroup = E('g', { mask: `url(#${id}-mask)` });
  for (const r of RINGS) {
    ringGroup.append(E('circle', {
      cx: CX, cy: CY, r, fill: 'none', 'stroke-width': UNIT, stroke: 'var(--radar-ring)',
    }));
  }
  svg.append(ringGroup);

  /* ---- the blob ---- */
  const pts = values.map((v, i) => pointAt(i, radiusFor(v ?? 0)));
  const d = smoothClosedPath(pts);
  svg.append(E('path', {
    d, fill: 'var(--radar-fill)', stroke: 'var(--radar-line)', 'stroke-width': 2,
    'stroke-linejoin': 'round',
  }));

  /* ---- the highlighted spoke ---- */
  if (highlight) {
    const i = AXES.findIndex((a) => a.key === highlight);
    if (i >= 0 && values[i] != null) {
      const [px, py] = pointAt(i, radiusFor(values[i]));
      svg.append(E('circle', {
        cx: px, cy: py, r: 5,
        fill: 'var(--radar-line)', stroke: 'var(--surface-2)', 'stroke-width': 2,
      }));
    }
  }

  /* ---- labels ---- */
  if (labels) {
    AXES.forEach((a, i) => {
      const on = highlight ? a.key === highlight : true;
      const [x, y] = pointAt(i, LABEL_R);
      svg.append(E('text', {
        x, y: y + 4,
        'text-anchor': 'middle',
        'font-size': 18,
        'font-weight': on ? 700 : 600,
        'letter-spacing': '0.06em',
        fill: 'var(--radar-label)',
        'font-family': 'var(--font-sans)',
        opacity: on ? 1 : 0.45,
      }, a.label));
      svg.append(E('text', {
        x, y: y + 24,
        'text-anchor': 'middle',
        'font-size': 16,
        'font-weight': on ? 600 : 400,
        fill: 'var(--radar-label)',
        'font-family': 'var(--font-sans)',
        opacity: on ? 0.8 : 0.3,
      }, values[i] == null ? '–' : values[i].toFixed(2)));
    });
  }

  /* ---- interactive wedges ---- */
  if (interactive) {
    AXES.forEach((a, i) => {
      const a0 = angleOf(i) - (36 * Math.PI / 180);
      const a1 = angleOf(i) + (36 * Math.PI / 180);
      const R = MAX_R + 8;
      const p = (ang) => `${(CX + R * Math.cos(ang)).toFixed(2)},${(CY + R * Math.sin(ang)).toFixed(2)}`;
      const wedge = E('path', {
        d: `M${CX},${CY} L${p(a0)} A${R},${R} 0 0 1 ${p(a1)} Z`,
        fill: 'transparent',
        style: 'cursor:pointer',
        'data-axis': a.key,
      });
      const pretty = a.label.charAt(0) + a.label.slice(1).toLowerCase();
      wedge.append(E('title', {}, values[i] == null
        ? `${pretty} — not scored`
        : `${pretty} ${values[i].toFixed(2)} out of 5`));
      wedge.addEventListener('pointerenter', () => wedge.setAttribute('fill', 'rgba(255,255,255,0.06)'));
      wedge.addEventListener('pointerleave', () => wedge.setAttribute('fill', 'transparent'));
      wedge.addEventListener('click', () => {
        if (onSelect) onSelect(a);
        else document.getElementById(a.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      svg.append(wedge);
    });
  }

  return svg;
}

