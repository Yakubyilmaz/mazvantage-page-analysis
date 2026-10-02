/* ==========================================================================
   Maz Vantage — the squarified treemap

   The classic Bruls/Huizing/van Wijk pass. Tiles are laid in rows across the
   shorter side, and a row is closed when adding the next tile would make its
   worst aspect ratio worse. Plain proportional slicing would give the small
   sectors slivers a label cannot sit in, which is the whole reason the
   algorithm exists.

   Positions come back in per cent of the container, so the caller places the
   tiles with CSS and lets the browser do the pixels. Port of the geometry in
   the legacy `sectorsblock.js`; nothing here touches the DOM.
   ========================================================================== */

export interface Placed { x: number; y: number; w: number; h: number }

/** The worst aspect ratio in `row` if it were laid along `side`. */
function worst(row: number[], side: number, sum: number): number {
  if (!row.length || sum <= 0 || side <= 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

/** `items` carry a positive `value`; each comes back with `{ x, y, w, h }` in per cent. */
export function squarify<T extends { value: number }>(
  items: T[], x = 0, y = 0, w = 100, h = 100, out: (T & Placed)[] = [],
): (T & Placed)[] {
  const live = items.filter((i) => i.value > 0);
  if (!live.length) return out;
  if (live.length === 1) {
    out.push({ ...live[0], x, y, w, h });
    return out;
  }

  const total = live.reduce((a, i) => a + i.value, 0);
  const side = Math.min(w, h);
  // Scale values into area units so `worst` compares like with like.
  const scale = (w * h) / total;

  const row: number[] = [];
  let rowSum = 0;
  for (const item of live) {
    const v = item.value * scale;
    const next = worst([...row, v], side, rowSum + v);
    if (row.length && next > worst(row, side, rowSum)) break;
    row.push(v);
    rowSum += v;
  }

  const placed = live.slice(0, row.length);
  if (w >= h) {
    const rowW = rowSum / h;
    let cy = y;
    placed.forEach((item, k) => {
      const ih = (row[k] / rowSum) * h;
      out.push({ ...item, x, y: cy, w: rowW, h: ih });
      cy += ih;
    });
    squarify(live.slice(row.length), x + rowW, y, w - rowW, h, out);
  } else {
    const rowH = rowSum / w;
    let cx = x;
    placed.forEach((item, k) => {
      const iw = (row[k] / rowSum) * w;
      out.push({ ...item, x: cx, y, w: iw, h: rowH });
      cx += iw;
    });
    squarify(live.slice(row.length), x, y + rowH, w, h - rowH, out);
  }
  return out;
}
