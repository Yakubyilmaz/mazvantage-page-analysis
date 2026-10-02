/* ==========================================================================
   Maz Vantage — formatting helpers

   Port of the legacy `util.js`, minus its DOM builder (`el`, `$`, `esc`),
   which React replaces. Every function keeps its name and its output, because
   the whole report prints through these and a changed rounding rule would
   move numbers across hundreds of cells at once.
   ========================================================================== */

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export type Maybe<T> = T | null | undefined;

/** 4543533578600 -> "US$4.54t". Scales through k / m / b / t. */
export function money(
  v: Maybe<number>,
  { currency = 'US$', dp = 2, plain = false }: { currency?: string; dp?: number; plain?: boolean } = {},
): string {
  if (!isNum(v)) return 'n/a';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (plain) {
    return sign + currency + a.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp });
  }
  const units: [number, string][] = [[1e12, 't'], [1e9, 'b'], [1e6, 'm'], [1e3, 'k']];
  for (const [scale, suffix] of units) {
    // Keep at least one decimal in the hundreds, so 149.3b and 150.0b stay
    // distinguishable rather than both collapsing to "150b".
    if (a >= scale) return `${sign}${currency}${dec(a / scale, a / scale >= 100 ? 1 : dp)}${suffix}`;
  }
  return `${sign}${currency}${trim(a, dp)}`;
}

/** Compact number without a currency prefix. */
export function num(v: Maybe<number>, dp = 2): string {
  if (!isNum(v)) return 'n/a';
  return money(v, { currency: '', dp });
}

/** 0.2761 -> "27.6%". Pass `already: true` when the input is already 0-100. */
export function pct(
  v: Maybe<number>,
  { dp = 1, already = false, sign = false }: { dp?: number; already?: boolean; sign?: boolean } = {},
): string {
  if (!isNum(v)) return 'n/a';
  const x = already ? v : v * 100;
  const s = sign && x > 0 ? '+' : '';
  return `${s}${trim(x, dp)}%`;
}

/** 35.31 -> "35.3x" */
export function mult(v: Maybe<number>, dp = 1): string {
  return isNum(v) ? `${trim(v, dp)}x` : 'n/a';
}

/** Drop trailing zeros: 4.50 -> "4.5", 4.00 -> "4". */
export function trim(v: Maybe<number>, dp = 2): string {
  if (!isNum(v)) return 'n/a';
  return Number(v.toFixed(dp)).toLocaleString('en-US', { maximumFractionDigits: dp });
}

/** Keep exactly `dp` decimals: 1.0033 -> "1.00". Use where a bare "1" would mislead. */
export function dec(v: Maybe<number>, dp = 2): string {
  if (!isNum(v)) return 'n/a';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Price with the right number of decimals for its magnitude. */
export function price(v: Maybe<number>, currency = 'US$'): string {
  if (!isNum(v)) return 'n/a';
  // Sub-dollar prices need four decimals, but zero is not a penny stock — it
  // is an axis tick, and "US$0.0000" reads as a rounding artefact.
  if (v === 0) return `${currency}0`;
  const dp = Math.abs(v) >= 1 ? 2 : 4;
  return currency + v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Compound annual growth rate from `first` to `last` over `years`. */
export function cagr(first: Maybe<number>, last: Maybe<number>, years: Maybe<number>): number | null {
  if (!isNum(first) || !isNum(last) || !isNum(years) || years <= 0) return null;
  if (first <= 0 || last <= 0) return null; // undefined for sign flips
  return Math.pow(last / first, 1 / years) - 1;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Year-on-year change, or null where either end is missing or crosses zero.
 *
 * A sign flip has no percentage: "improved by 340%" from a loss to a profit is
 * a sentence about arithmetic rather than about the company, so the callers
 * that print a delta print nothing instead.
 */
export function yoy(now: Maybe<number>, prev: Maybe<number>): number | null {
  if (!isNum(now) || !isNum(prev) || prev === 0) return null;
  if (prev < 0 !== now < 0) return null;
  return now / Math.abs(prev) - 1;
}

/**
 * Sample standard deviation (n−1), for the consistency metrics.
 *
 * n−1 rather than n because five annual observations are a sample of the
 * company's behaviour, not the whole of it, and the population form would
 * report a company as steadier than the evidence supports.
 */
export function stdev(arr: readonly unknown[]): number | null {
  const xs = arr.filter(isNum);
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function sum(arr: readonly unknown[]): number {
  return arr.reduce<number>((a, b) => a + (isNum(b) ? b : 0), 0);
}

export function mean(arr: readonly unknown[]): number | null {
  const xs = arr.filter(isNum);
  return xs.length ? sum(xs) / xs.length : null;
}

export function median(arr: readonly unknown[]): number | null {
  const xs = arr.filter(isNum).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

/* ---------- dates --------------------------------------------------------- */

export type DateLike = string | number | Date | null | undefined;

export function parseDate(d: DateLike): Date | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

export function fmtDate(
  d: DateLike,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  const t = parseDate(d);
  return t ? t.toLocaleDateString('en-GB', opts) : 'n/a';
}

export function fmtDateShort(d: DateLike): string {
  return fmtDate(d, { day: '2-digit', month: 'short' });
}

export function yearOf(d: DateLike): number | null {
  const t = parseDate(d);
  return t ? t.getUTCFullYear() : null;
}

/** "5h ago", "3 days ago" */
export function ago(d: DateLike): string {
  const t = parseDate(d);
  if (!t) return '';
  const mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const mos = Math.round(days / 30);
  return mos < 12 ? `${mos}mo ago` : `${Math.round(mos / 12)}y ago`;
}

/* ---------- misc ---------------------------------------------------------- */

export function initials(name: Maybe<string>): string {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Signed tone for colouring deltas: `'pos' | 'neg' | ''`, as the legacy class names were. */
export function signClass(v: Maybe<number>): '' | 'pos' | 'neg' {
  if (!isNum(v) || v === 0) return '';
  return v > 0 ? 'pos' : 'neg';
}

/** The Tailwind text colour for a signed figure. */
export function signTone(v: Maybe<number>): string {
  const s = signClass(v);
  return s === 'pos' ? 'text-up' : s === 'neg' ? 'text-down' : '';
}

export function titleCase(s: Maybe<string>): string {
  return String(s || '').replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/** Currency code -> the symbol to print in front of a price. (Legacy `ui.js` `curSymbol`.) */
export function curSymbol(code: Maybe<string>): string {
  const map: Record<string, string> = {
    USD: 'US$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'AU$', CHF: 'CHF ', INR: '₹',
  };
  return (code && map[code]) || `${code} `;
}

/** Punctuation out, not just whitespace — "Statistics & Metrics" → `statistics-metrics`. */
export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
