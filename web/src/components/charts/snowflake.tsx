'use client';

/* ==========================================================================
   Maz Vantage — the Maz Vantage Flake

   A five-axis radar where each spoke is one factor scored 0-5, continuously.
   The blob is a closed Catmull-Rom curve through the five score points, so a
   company with one strong factor reads as a spike and an all-round company
   reads as a pentagon.

   Spokes start at 12 o'clock and step 72 degrees clockwise:
     Value → Profitability → Growth → Momentum → Health
   Radius runs linearly from UNIT at 0 to MAX_R at 5, so a zero still shows as
   a small nub. Three rings mark 1.25, 3 and 4.75; a mask punches the spokes
   out of them, which is what gives the flake its segmented look.
   ========================================================================== */

import * as React from 'react';

export const AXES = [
  { key: 'valuation', label: 'VALUE', anchor: 'valuation' },
  { key: 'profitability', label: 'PROFITABILITY', anchor: 'profitability' },
  { key: 'growth', label: 'GROWTH', anchor: 'growth' },
  { key: 'momentum', label: 'MOMENTUM', anchor: 'momentum' },
  { key: 'health', label: 'HEALTH', anchor: 'financial-health' },
] as const;

export type Axis = (typeof AXES)[number];

const CX = 170;
const CY = 145;
const UNIT = 17;
const MAX_R = 119;
const MAX_SCORE = 5;
const LABEL_R = 140;

const angleOf = (i: number) => ((-90 + i * 72) * Math.PI) / 180;
const pointAt = (i: number, r: number): [number, number] => [CX + r * Math.cos(angleOf(i)), CY + r * Math.sin(angleOf(i))];
const radiusFor = (score: number | null | undefined) =>
  UNIT + (Math.max(0, Math.min(MAX_SCORE, score ?? 0)) / MAX_SCORE) * (MAX_R - UNIT);
const RINGS = [1.25, 3, 4.75].map(radiusFor);

/** Closed Catmull-Rom through `pts`, emitted as cubic beziers. */
function smoothClosedPath(pts: [number, number][], tension = 1.15) {
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n];
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)}, ${c2[0].toFixed(2)} ${c2[1].toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

/**
 * `highlight` is an axis key: its label and score are drawn at full strength
 * and a dot is placed on its spoke, so the same flake repeated in each factor
 * section reads as "you are here" rather than as five identical pictures.
 *
 * A wedge click calls `onSelect`, or scrolls to the factor's anchor.
 */
export function Snowflake({
  scores, size = 190, labels = true, interactive = true, onSelect, highlight = null,
}: {
  scores: Partial<Record<string, number | null | undefined>> | null | undefined;
  size?: number;
  labels?: boolean;
  interactive?: boolean;
  onSelect?: (axis: Axis) => void;
  highlight?: string | null;
}) {
  const id = React.useId().replace(/:/g, '');
  const [hover, setHover] = React.useState<string | null>(null);
  const values = AXES.map((a) => (typeof scores?.[a.key] === 'number' ? (scores[a.key] as number) : null));
  const pts = values.map((v, i) => pointAt(i, radiusFor(v ?? 0)));
  const hi = highlight ? AXES.findIndex((a) => a.key === highlight) : -1;

  return (
    <svg
      // Padded well past the geometry: the longest label ("PROFITABILITY")
      // runs ~70 units past the right-hand point, and overflow stays visible.
      viewBox="-40 -14 420 336"
      width={size}
      style={{ width: size, maxWidth: '100%', height: 'auto', overflow: 'visible' }}
      role="img"
      aria-label={`Maz Vantage Flake: ${AXES.map((a, i) => `${a.label.toLowerCase()} ${values[i] == null ? 'not scored' : `${values[i]!.toFixed(2)} out of 5`}`).join(', ')}`}
    >
      <defs>
        <mask id={`${id}-mask`}>
          <rect width={340} height={300} fill="white" />
          {AXES.map((_, i) => {
            const [x, y] = pointAt(i, MAX_R + 10);
            return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="black" strokeWidth={5} />;
          })}
        </mask>
      </defs>
      <g mask={`url(#${id}-mask)`}>
        {RINGS.map((r) => <circle key={r} cx={CX} cy={CY} r={r} fill="none" strokeWidth={UNIT} stroke="var(--radar-ring)" />)}
      </g>
      <path d={smoothClosedPath(pts)} fill="var(--radar-fill)" stroke="var(--radar-line)" strokeWidth={2} strokeLinejoin="round" />
      {hi >= 0 && values[hi] != null ? (() => {
        const [px, py] = pointAt(hi, radiusFor(values[hi]));
        return <circle cx={px} cy={py} r={5} fill="var(--radar-line)" stroke="var(--muted)" strokeWidth={2} />;
      })() : null}
      {labels ? AXES.map((a, i) => {
        const on = highlight ? a.key === highlight : true;
        const [x, y] = pointAt(i, LABEL_R);
        return (
          <g key={a.key} fontFamily="var(--font-sans)">
            <text x={x} y={y + 4} textAnchor="middle" fontSize={18} fontWeight={on ? 700 : 600} letterSpacing="0.06em"
              fill="var(--radar-label)" opacity={on ? 1 : 0.45}>{a.label}</text>
            <text x={x} y={y + 24} textAnchor="middle" fontSize={16} fontWeight={on ? 600 : 400}
              fill="var(--radar-label)" opacity={on ? 0.8 : 0.3}>{values[i] == null ? '–' : values[i]!.toFixed(2)}</text>
          </g>
        );
      }) : null}
      {interactive ? AXES.map((a, i) => {
        const a0 = angleOf(i) - (36 * Math.PI) / 180;
        const a1 = angleOf(i) + (36 * Math.PI) / 180;
        const R = MAX_R + 8;
        const p = (ang: number) => `${(CX + R * Math.cos(ang)).toFixed(2)},${(CY + R * Math.sin(ang)).toFixed(2)}`;
        const pretty = a.label.charAt(0) + a.label.slice(1).toLowerCase();
        return (
          <path
            key={a.key}
            d={`M${CX},${CY} L${p(a0)} A${R},${R} 0 0 1 ${p(a1)} Z`}
            fill={hover === a.key ? 'rgba(255,255,255,0.06)' : 'transparent'}
            style={{ cursor: 'pointer' }}
            data-axis={a.key}
            onPointerEnter={() => setHover(a.key)}
            onPointerLeave={() => setHover(null)}
            onClick={() => {
              if (onSelect) onSelect(a);
              else document.getElementById(a.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <title>{values[i] == null ? `${pretty} — not scored` : `${pretty} ${values[i]!.toFixed(2)} out of 5`}</title>
          </path>
        );
      }) : null}
    </svg>
  );
}
