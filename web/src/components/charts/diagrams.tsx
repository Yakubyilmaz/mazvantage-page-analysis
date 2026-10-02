'use client';

/* ==========================================================================
   Maz Vantage — the bespoke diagrams

   The legacy `charts.js` drew these by hand, and they stay hand-drawn: each
   is a layout a chart library does not have, and some of them (the Sankey)
   are specified precisely so that no layout algorithm reorders them. Each is
   a fixed-viewBox SVG stretched to its container, so it stays crisp at any
   column width and prints cleanly. Colours are CSS custom properties.
   ========================================================================== */

import * as React from 'react';
import { isNum, money, pct, price, trim } from '@/lib/format';
import { niceDomain, ticksOf, linear } from '@/lib/chart-scale';
import { TipBox, useHoverTip } from '@/components/charts/chart-tip';
import { cn } from '@/lib/cn';

const W = 760;

function Frame({
  height, width = W, className, label, children,
}: { height: number; width?: number; className?: string; label?: string; children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet"
      className={cn('block h-auto w-full overflow-visible', className)}>
      {children}
    </svg>
  );
}

function EmptyText({ height, width = W, message }: { height: number; width?: number; message: string }) {
  return (
    <Frame height={height} width={width}>
      <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={12} fill="var(--muted-foreground)" opacity={0.8}>{message}</text>
    </Frame>
  );
}

/* ==========================================================================
   Sankey — where a total splits, and what it splits into

   Nodes are placed in explicit columns by the caller; the layout only sizes
   them and routes the ribbons, because a financial statement already knows
   its own left-to-right order and an algorithm reordering it would scramble
   the reading. A node's height is the larger of what flows in and out — for a
   statement those are equal by construction, so a visible mismatch is a data
   problem worth seeing.
   ========================================================================== */

export interface SankeyNode { id: string; label: string; layer: number; color?: string }
export interface SankeyLink { from: string; to: string; value: number | null | undefined }

export function SankeyChart({
  nodes, links, height = 300, fmt = (v: number) => money(v),
}: { nodes: SankeyNode[]; links: SankeyLink[]; height?: number; fmt?: (v: number) => string }) {
  const { bind, tip } = useHoverTip();
  const [hot, setHot] = React.useState<number | null>(null);

  const live = links.filter((l): l is SankeyLink & { value: number } => isNum(l.value) && l.value > 0);
  if (!live.length) return <EmptyText height={height} message="Not enough of the statement is published to draw this" />;

  type N = SankeyNode & { in: number; out: number; total: number; x?: number; y?: number; h?: number; inCursor?: number; outCursor?: number };
  const byId = new Map<string, N>(nodes.map((n) => [n.id, { ...n, in: 0, out: 0, total: 0 }]));
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
  if (!cols.some((c) => c.length)) return <EmptyText height={height} message="Nothing to chart" />;

  const pad = { t: 22, b: 22, l: 4, r: 4 };
  const NODE_W = 13;
  // Enough vertical air for a two-line label beside each node.
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
  if (!Number.isFinite(scale) || scale <= 0) return <EmptyText height={height} message="Nothing to chart" />;

  const colX = (i: number) => (layers.length === 1 ? pad.l : pad.l + ((W - pad.l - pad.r - NODE_W) * i) / (layers.length - 1));
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

  const ribbons = live.flatMap((l, k) => {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b || !isNum(a.x) || !isNum(b.x)) return [];
    const h = l.value * scale;
    const y0 = a.outCursor!;
    const y1 = b.inCursor!;
    a.outCursor! += h;
    b.inCursor! += h;
    const x0 = a.x + NODE_W;
    const x1 = b.x;
    const mx = (x0 + x1) / 2;
    const d = `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + h} C${mx},${y1 + h} ${mx},${y0 + h} ${x0},${y0 + h} Z`;
    return [{ k, d, color: b.color || a.color || 'var(--chart-1)', a, b, value: l.value }];
  });

  return (
    <>
      <Frame height={height}>
        {/* Ribbons first, so the node bars and their labels sit over the joins. */}
        <g>
          {ribbons.map((r) => {
            const hover = bind(<TipBox title={`${r.a.label} → ${r.b.label}`} lines={[{ value: fmt(r.value) }]} />);
            return (
              <path key={r.k} d={r.d} fill={r.color} opacity={hot === r.k ? 0.55 : 0.3}
                onPointerEnter={(e) => { setHot(r.k); hover.onPointerEnter(e); }}
                onPointerMove={hover.onPointerMove}
                onPointerLeave={() => { setHot(null); hover.onPointerLeave(); }} />
            );
          })}
        </g>
        {[...byId.values()].filter((n) => isNum(n.x)).map((n) => {
          // Beside the bar and vertically centred: a stacked column would
          // otherwise run one node's value into the next one's name. The last
          // column reads inward — there is no canvas to its right.
          const last = n.layer === layers[layers.length - 1];
          const lx = last ? n.x! - 7 : n.x! + NODE_W + 7;
          const cy = n.y! + n.h! / 2;
          const anchor = last ? 'end' : 'start';
          return (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={2} fill={n.color || 'var(--chart-1)'}
                {...bind(<TipBox title={n.label} lines={[{ value: fmt(n.total) }]} />)} />
              <text x={lx} y={cy - 2} textAnchor={anchor} fontSize={11} fill="var(--muted-foreground)">{n.label}</text>
              <text x={lx} y={cy + 11} textAnchor={anchor} fontSize={11} fontWeight={600} fill="var(--foreground)">{fmt(n.total)}</text>
            </g>
          );
        })}
      </Frame>
      {tip}
    </>
  );
}

/* ==========================================================================
   Percentile strip — one subtopic's ratios at a glance

   Every ratio on one axis of sector percentile, so the spread and the
   outliers read in a glance. `pctile` is already the graded percentile —
   inverted for ratios where low is good — so 100 is always the good end.
   ========================================================================== */

export interface StripRow { label: string; pctile: number | null | undefined; valueText?: string; rankText?: string }

export function PercentileStrip({ rows, height = 96 }: { rows: StripRow[]; height?: number }) {
  const { bind, tip } = useHoverTip();
  const live = rows.filter((r): r is StripRow & { pctile: number } => isNum(r.pctile));
  if (!live.length) return <EmptyText height={height} message="Nothing here could be ranked against the sector" />;

  const pad = { l: 56, r: 56, t: 30, b: 30 };
  const sx = linear(0, 1, pad.l, W - pad.r);
  const midY = pad.t + (height - pad.t - pad.b) / 2;

  // Lanes, so ratios that rank within a few points of each other stay legible
  // instead of stacking into one dot.
  const sorted = [...live].sort((a, b) => a.pctile - b.pctile);
  const lastX: number[] = [];
  const MIN_GAP = 26;
  const placed = sorted.map((r) => {
    const x = sx(r.pctile);
    let lane = 0;
    while (lane < 3 && isNum(lastX[lane]) && x - lastX[lane] < MIN_GAP) lane++;
    if (lane === 3) lane = 0;
    lastX[lane] = x;
    return { r, x, y: midY + (lane === 0 ? 0 : lane === 1 ? -13 : 13) };
  });

  return (
    <>
      <Frame height={height}>
        <line x1={pad.l} x2={W - pad.r} y1={midY} y2={midY} stroke="var(--border)" strokeWidth={2} strokeLinecap="round" />
        <line x1={sx(0.5)} x2={sx(0.5)} y1={midY - 16} y2={midY + 16} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={sx(0.5)} y={pad.t - 12} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">sector median</text>
        <text x={pad.l} y={height - 8} textAnchor="start" fontSize={11} fill="var(--muted-foreground)">Weaker</text>
        <text x={W - pad.r} y={height - 8} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">Stronger</text>
        {placed.map(({ r, x, y }, i) => (
          <g key={i}>
            {y !== midY ? <line x1={x} x2={x} y1={midY} y2={y} stroke="var(--border)" strokeWidth={1} /> : null}
            <circle cx={x} cy={y} r={5} fill={r.pctile >= 0.5 ? 'var(--up)' : 'var(--down)'} stroke="var(--background)" strokeWidth={1.5}
              {...bind(<TipBox title={r.label} lines={[{ value: [r.valueText, r.rankText].filter(Boolean).join(' · ') }]} />)} />
          </g>
        ))}
      </Frame>
      {tip}
    </>
  );
}

/* ==========================================================================
   Valuation range — the football field

   Every model that produced a number, on one price axis, against the market
   price. A single model is an opinion; the spread across all of them is the
   actual finding. The axis starts at zero: these are prices, and a clipped
   axis would exaggerate every gap.
   ========================================================================== */

export interface RangeRow { label: string; full?: string; value: number; basisLabel?: string; target?: number | null }

export function ValuationRangeChart({ rows, current, currency = 'US$' }: { rows: RangeRow[]; current?: number | null; currency?: string }) {
  const { bind, tip } = useHoverTip();
  const rowH = 24;
  const pad = { l: 138, r: 30, t: 34, b: 32 };
  const height = pad.t + Math.max(rows.length, 1) * rowH + pad.b;
  if (!rows.length) return <EmptyText height={height} message="No model produced a fair value" />;

  const vals = rows.map((r) => r.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const dom = niceDomain(0, Math.max(hi, isNum(current) ? current : hi) * 1.06, 6);
  const sx = linear(dom.lo, dom.hi, pad.l, W - pad.r);
  const gridY = pad.t + rows.length * rowH;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  return (
    <>
      <Frame height={height}>
        {/* Band across the models' own range, so the spread reads before any one dot. */}
        <rect x={sx(lo)} y={pad.t} width={Math.max(sx(hi) - sx(lo), 1)} height={rows.length * rowH}
          fill="color-mix(in srgb, var(--primary) 6%, transparent)" rx={3} />
        <line x1={sx(mid)} x2={sx(mid)} y1={pad.t} y2={gridY} stroke="var(--primary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.75} />
        {ticksOf(dom).map((v) => (
          <g key={v}>
            <line x1={sx(v)} x2={sx(v)} y1={pad.t} y2={gridY} stroke="var(--grid)" strokeWidth={1} />
            <text x={sx(v)} y={gridY + 16} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
              {money(v, { currency, dp: 0, plain: true })}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = pad.t + i * rowH + rowH / 2;
          const over = isNum(current) && current > r.value;
          const color = over ? 'var(--down)' : 'var(--up)';
          // The figure rides beside its dot, flipping inward near the right edge.
          const near = sx(r.value) > W - pad.r - 78;
          return (
            <g key={`${r.label}-${i}`}>
              <text x={pad.l - 12} y={y + 4} textAnchor="end" fontSize={11.5} fill="var(--muted-foreground)">{r.label}</text>
              {/* A leader line: without it the eye cannot carry a label across
                  400px of empty chart to the right dot. */}
              <line x1={pad.l} x2={sx(r.value)} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} />
              <circle cx={sx(r.value)} cy={y} r={5} fill={color}
                {...bind(<TipBox title={r.full || r.label} lines={[
                  { value: price(r.value, currency) },
                  ...(r.basisLabel ? [{ value: `target from ${r.basisLabel}${isNum(r.target) ? ` — ${trim(r.target, 1)}x` : ''}` }] : []),
                ]} />)} />
              <text x={sx(r.value) + (near ? -11 : 11)} y={y + 4} textAnchor={near ? 'end' : 'start'} fontSize={11.5} fontWeight={600} fill={color}>
                {price(r.value, currency)}
              </text>
            </g>
          );
        })}
        {isNum(current) ? (
          <g>
            <line x1={sx(current)} x2={sx(current)} y1={pad.t - 8} y2={gridY + 4} stroke="var(--primary)" strokeWidth={2} />
            <text x={sx(current) + (sx(current) > W - pad.r - 70 ? -8 : 8)} y={pad.t - 14}
              textAnchor={sx(current) > W - pad.r - 70 ? 'end' : 'start'} fontSize={11.5} fontWeight={600} fill="var(--primary)">
              Price {price(current, currency)}
            </text>
          </g>
        ) : null}
      </Frame>
      {tip}
    </>
  );
}

/* ==========================================================================
   Range bar — analyst price targets against the current price
   ========================================================================== */

export function RangeChart({
  low, avg, high, current, currency = 'US$', height = 132,
}: { low?: number | null; avg?: number | null; high?: number | null; current?: number | null; currency?: string; height?: number }) {
  if (!isNum(low) || !isNum(high) || !isNum(current)) return <EmptyText height={height} message="No analyst target range available" />;
  const pad = 60;
  const lo = Math.min(low, current) * 0.96;
  const hi = Math.max(high, current) * 1.04;
  const sx = linear(lo, hi, pad, W - pad);
  const yBar = 56;
  const marker = (x: number, color: string, label: string, value: number, above: boolean) => (
    <g key={label}>
      <line x1={x} x2={x} y1={above ? yBar - 16 : yBar + 10} y2={above ? yBar : yBar + 26} stroke={color} strokeWidth={2} />
      <circle cx={x} cy={yBar + 5} r={5} fill={color} stroke="var(--background)" strokeWidth={2} />
      <text x={x} y={above ? yBar - 22 : yBar + 40} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">{label}</text>
      <text x={x} y={above ? yBar - 36 : yBar + 54} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--foreground)">{price(value, currency)}</text>
    </g>
  );
  return (
    <Frame height={height}>
      <rect x={pad} y={yBar} width={W - pad * 2} height={10} rx={5} fill="var(--accent)" />
      <rect x={sx(low)} y={yBar} width={Math.max(sx(high) - sx(low), 2)} height={10} rx={5} fill="var(--chart-1)" opacity={0.55} />
      {marker(sx(low), 'var(--muted-foreground)', 'Low', low, false)}
      {marker(sx(high), 'var(--muted-foreground)', 'High', high, false)}
      {isNum(avg) ? marker(sx(avg), 'var(--chart-1)', 'Consensus', avg, true) : null}
      {marker(sx(current), 'var(--primary)', 'Current', current, true)}
    </Frame>
  );
}

/* ==========================================================================
   Fair-value bar — current price against an intrinsic estimate
   ========================================================================== */

export function FairValueChart({
  current, fair, currency = 'US$', height = 150,
}: { current?: number | null; fair?: number | null; currency?: string; height?: number }) {
  if (!isNum(current) || !isNum(fair)) return <EmptyText height={height} message="No fair value estimate available" />;
  const pad = { l: 108, r: 24, t: 24 };
  const sx = linear(0, Math.max(current, fair) * 1.12, pad.l, W - pad.r);
  const rowH = 40;
  const barH = 26;
  const over = current > fair;
  const rows: [string, number, string][] = [['Current price', current, 'var(--primary)'], ['Fair value', fair, over ? 'var(--down)' : 'var(--up)']];
  return (
    <Frame height={height}>
      {rows.map(([label, v, color], i) => {
        const y = pad.t + i * rowH;
        return (
          <g key={label}>
            <text x={pad.l - 12} y={y + barH / 2 + 4} textAnchor="end" fontSize={12} fill="var(--muted-foreground)">{label}</text>
            <rect x={pad.l} y={y} width={Math.max(sx(v) - pad.l, 2)} height={barH} rx={4} fill={color} />
            <text x={sx(v) + 10} y={y + barH / 2 + 4} fontSize={12} fontWeight={600} fill="var(--foreground)">{price(v, currency)}</text>
          </g>
        );
      })}
      <text x={pad.l} y={pad.t + rowH * 2 + 22} fontSize={13} fontWeight={600} fill={over ? 'var(--down)' : 'var(--up)'}>
        {pct(Math.abs(current / fair - 1))} {over ? 'overvalued' : 'undervalued'}
      </text>
    </Frame>
  );
}

/* ==========================================================================
   Radial gauge — ratios, payout, ROE
   ========================================================================== */

export function Gauge({
  value, min = 0, max = 1, label = '', fmt = (v: number) => pct(v), size = 168, bands = [],
}: {
  value: number | null | undefined; min?: number; max?: number; label?: string;
  fmt?: (v: number) => string; size?: number; bands?: { from: number; to: number; color: string }[];
}) {
  const cx = 100;
  const cy = 104;
  const r = 78;
  const clampV = Math.max(min, Math.min(max, isNum(value) ? value : min));
  const angle = (v: number) => Math.PI * (1 - (v - min) / (max - min));
  const pt = (v: number, rad = r): [number, number] => [cx + rad * Math.cos(angle(v)), cy - rad * Math.sin(angle(v))];
  const arc = (from: number, to: number, color: string, key: string) => {
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    const large = Math.abs(angle(from) - angle(to)) > Math.PI ? 1 : 0;
    return <path key={key} d={`M${x1},${y1}A${r},${r} 0 ${large} 1 ${x2},${y2}`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />;
  };
  const [nx, ny] = pt(clampV, r - 22);
  return (
    <svg viewBox="0 0 200 130" className="block" style={{ width: size, maxWidth: '100%' }} role="img"
      aria-label={`${label} ${isNum(value) ? fmt(value) : 'n/a'}`}>
      {arc(min, max, 'var(--accent)', 'track')}
      {bands.map((b, i) => arc(b.from, b.to, b.color, `b${i}`))}
      {isNum(value) ? arc(min, clampV, bands.length ? 'transparent' : 'var(--primary)', 'fill') : null}
      {isNum(value) ? (
        <>
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--foreground)" strokeWidth={3} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={6} fill="var(--foreground)" />
        </>
      ) : null}
      <text x={cx} y={cy - 26} textAnchor="middle" fontSize={24} fontWeight={700} fill="var(--foreground)">{isNum(value) ? fmt(value) : 'n/a'}</text>
      {label ? <text x={cx} y={cy + 20} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">{label}</text> : null}
    </svg>
  );
}

/* ==========================================================================
   Volatility strip — where this stock sits against market and industry
   ========================================================================== */

export function VolatilityStrip({
  stock, market, industry, height = 96,
}: { stock?: number | null; market?: number | null; industry?: number | null; height?: number }) {
  const gid = React.useId().replace(/:/g, '');
  const vals = [stock, market, industry].filter(isNum);
  if (!vals.length) return <EmptyText height={height} message="No volatility data" />;
  const pad = 40;
  const sx = linear(0, Math.max(...vals) * 1.35, pad, W - pad);
  const y = 46;
  const mark = (v: number | null | undefined, label: string, color: string, above: boolean) => {
    if (!isNum(v)) return null;
    const x = Math.min(Math.max(sx(v), pad), W - pad);
    return (
      <g key={label || 'stock'}>
        <line x1={x} x2={x} y1={above ? y - 8 : y + 12} y2={above ? y : y + 22} stroke={color} strokeWidth={2} />
        <circle cx={x} cy={y + 6} r={5.5} fill={color} stroke="var(--background)" strokeWidth={2} />
        <text x={x} y={above ? y - 14 : y + 36} textAnchor="middle" fontSize={11}
          fill={color === 'var(--primary)' ? 'var(--foreground)' : 'var(--muted-foreground)'}>
          {`${label} ${pct(v)}`.trim()}
        </text>
      </g>
    );
  };
  return (
    <Frame height={height}>
      <defs>
        <linearGradient id={gid} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--up)" />
          <stop offset="55%" stopColor="var(--grade-mid)" />
          <stop offset="100%" stopColor="var(--down)" />
        </linearGradient>
      </defs>
      <rect x={pad} y={y} width={W - pad * 2} height={12} rx={6} fill={`url(#${gid})`} opacity={0.65} />
      <text x={pad} y={y - 10} fontSize={11} fill="var(--muted-foreground)">Low</text>
      <text x={W - pad} y={y - 10} fontSize={11} textAnchor="end" fill="var(--muted-foreground)">High</text>
      {mark(market, 'Market', 'var(--muted-foreground)', false)}
      {mark(industry, 'Industry', 'var(--chart-1)', false)}
      {mark(stock, '', 'var(--primary)', true)}
    </Frame>
  );
}

export { W as CHART_WIDTH };
