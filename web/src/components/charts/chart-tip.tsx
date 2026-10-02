'use client';

/* ==========================================================================
   The chart tooltip

   One look for every chart: a small popover that follows the pointer, a bold
   figure and a muted label (the legacy `.tip`). Recharts charts pass
   `RechartsTip` as their `content`; the hand-drawn SVG diagrams use
   `useHoverTip`, which is the port of the legacy `bindTip`.
   ========================================================================== */

import * as React from 'react';
import { createPortal } from 'react-dom';

export interface TipLine {
  label?: React.ReactNode;
  value?: React.ReactNode;
}

export function TipBox({ title, lines }: { title?: React.ReactNode; lines?: TipLine[] }) {
  return (
    <div className="pointer-events-none max-w-[280px] rounded-md border border-border bg-popover px-2.5 py-1.5 text-tiny leading-relaxed text-popover-foreground shadow-lg">
      {title ? <b className="block font-semibold">{title}</b> : null}
      {lines?.map((l, i) => (
        <div key={i}>
          {l.label ? <span className="text-muted-foreground">{l.label}</span> : null}
          {l.value}
        </div>
      ))}
    </div>
  );
}

/** A `content` for Recharts' <Tooltip>: the category or date as the title, one line per series. */
export function RechartsTip({
  active, payload, label, valueFmt, labelFmt, names,
}: {
  active?: boolean;
  payload?: readonly any[];
  label?: any;
  valueFmt: (v: number) => string;
  labelFmt?: (l: any, payload?: any) => React.ReactNode;
  names?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const shown = payload.filter((p) => p.value != null && !(Array.isArray(p.value) && p.value.some((v: unknown) => v == null)));
  if (!shown.length) return null;
  return (
    <TipBox
      title={labelFmt ? labelFmt(label, shown[0]?.payload) : label}
      lines={shown.map((p) => ({
        label: names === false ? undefined : `${p.name}: `,
        value: Array.isArray(p.value) ? p.value.map((v: number) => valueFmt(v)).join(' – ') : valueFmt(p.value),
      }))}
    />
  );
}

/**
 * Hover tooltips for hand-drawn SVG: `bind(content)` returns pointer handlers
 * for any element, and `tip` is the floating box to render once.
 */
export function useHoverTip() {
  const [state, setState] = React.useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const box = React.useRef<HTMLDivElement>(null);

  const bind = React.useCallback((content: React.ReactNode | (() => React.ReactNode)) => ({
    onPointerEnter: (e: React.PointerEvent) =>
      setState({ x: e.clientX, y: e.clientY, content: typeof content === 'function' ? (content as () => React.ReactNode)() : content }),
    onPointerMove: (e: React.PointerEvent) => setState((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s)),
    onPointerLeave: () => setState(null),
  }), []);

  // Kept inside the viewport: flipped to the pointer's other side near an edge.
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!state) { setPos(null); return; }
    const pad = 14;
    const r = box.current?.getBoundingClientRect();
    let left = state.x + pad;
    let top = state.y + pad;
    if (r && left + r.width > window.innerWidth - 8) left = state.x - r.width - pad;
    if (r && top + r.height > window.innerHeight - 8) top = state.y - r.height - pad;
    setPos({ left, top });
  }, [state]);

  const tip = state && typeof document !== 'undefined'
    ? createPortal(
      <div ref={box} className="fixed z-[980]" style={pos ?? { left: state.x + 14, top: state.y + 14 }}>
        {typeof state.content === 'string' ? <TipBox title={state.content} /> : state.content}
      </div>,
      document.body,
    )
    : null;

  return { bind, tip };
}
