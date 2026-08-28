/* ==========================================================================
   Maz Vantage — the Vantage Flake

   A five-axis radar where each spoke is one factor graded 1-5 against the
   company's sector cohort. The blob is a closed Catmull-Rom curve through the
   five grade points, so a company strong on one factor reads as a spike and an
   all-round company reads as a pentagon.

   Geometry
   --------
   Spokes start at 12 o'clock and step 72 degrees clockwise:
     Value → Growth → Profitability → Health → Momentum
   Grade 1 sits at radius 24 and grade 5 at 119, so even a bottom-decile factor
   still draws something rather than vanishing. Three rings mark grades 2, 3.5
   and 5; a mask punches the spokes out of them, which is what gives the flake
   its segmented look.
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

export const AXES = [
  { key: 'value',         label: 'VALUE',         anchor: 'value' },
  { key: 'growth',        label: 'GROWTH',        anchor: 'growth' },
  { key: 'profitability', label: 'PROFITABILITY', anchor: 'profitability' },
  { key: 'health',        label: 'HEALTH',        anchor: 'health' },
  { key: 'momentum',      label: 'MOMENTUM',      anchor: 'momentum' },
];

const CX = 170, CY = 145;
const MIN_R = 24;                // grade 1 still draws a visible nub
const MAX_R = 119;               // grade 5 reaches the outer ring
const RINGS = [47.5, 83.25, 119];   // grades 2, 3.5 and 5
const LABEL_R = 142;
const RING_W = 15;

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

/** Grade 1-5 -> radius. Ungraded factors collapse to the centre nub. */
const radiusFor = (grade) => {
  if (typeof grade !== 'number' || !Number.isFinite(grade)) return MIN_R;
  const g = Math.max(1, Math.min(5, grade));
  return MIN_R + ((g - 1) / 4) * (MAX_R - MIN_R);
};

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

const fmtGrade = (g) =>
  (typeof g === 'number' && Number.isFinite(g) ? g.toFixed(2) : '—');

/**
 * @param {object} scores  { value, growth, profitability, health, momentum } -> 1..5
 * @param {object} opts    { size, labels, interactive, onSelect }
 */
export function snowflake(scores, {
  size = 190,
  labels = true,
  interactive = true,
  onSelect = null,
} = {}) {
  const id = `flake${++seq}`;
  const values = AXES.map((a) => scores?.[a.key] ?? null);

  const svg = E('svg', {
    viewBox: '0 0 340 300',
    width: size,
    style: `width:${size}px;max-width:100%;height:auto`,
    role: 'img',
    'aria-label': `Vantage Flake: ${AXES.map((a, i) => `${a.label.toLowerCase()} ${fmtGrade(values[i])} out of 5`).join(', ')}`,
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
      cx: CX, cy: CY, r, fill: 'none', 'stroke-width': RING_W, stroke: 'var(--radar-ring)',
    }));
  }
  svg.append(ringGroup);

  /* ---- the blob ---- */
  const pts = values.map((v, i) => pointAt(i, radiusFor(v)));
  const d = smoothClosedPath(pts);
  svg.append(E('path', {
    d, fill: 'var(--radar-fill)', stroke: 'var(--radar-line)', 'stroke-width': 2,
    'stroke-linejoin': 'round',
  }));

  /* ---- labels ---- */
  if (labels) {
    AXES.forEach((a, i) => {
      const [x, y] = pointAt(i, LABEL_R);
      svg.append(E('text', {
        x, y: y + 4,
        'text-anchor': 'middle',
        'font-size': 11,
        'font-weight': 600,
        'letter-spacing': '0.08em',
        fill: 'var(--radar-label)',
        'font-family': 'var(--font-sans)',
        opacity: 0.75,
      }, a.label));
      svg.append(E('text', {
        x, y: y + 17,
        'text-anchor': 'middle',
        'font-size': 10,
        fill: 'var(--radar-label)',
        'font-family': 'var(--font-sans)',
        opacity: 0.45,
      }, fmtGrade(values[i])));
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
      wedge.append(E('title', {}, `${a.label.charAt(0) + a.label.slice(1).toLowerCase()} ${fmtGrade(values[i])}/5`));
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

/** Small inline flake for cards and lists — no labels, no interaction. */
export function miniFlake(scores, size = 44) {
  return snowflake(scores, { size, labels: false, interactive: false });
}
