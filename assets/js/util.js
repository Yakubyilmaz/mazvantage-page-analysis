/* ==========================================================================
   Maz Vantage — formatting & DOM helpers
   ========================================================================== */

/* ---------- DOM ----------------------------------------------------------- */

/** Build an element. `attrs` keys: class, html, text, style, data-*, on* handlers. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape for safe interpolation into innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- numbers ------------------------------------------------------- */

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** 4543533578600 -> "US$4.54t". Scales through k / m / b / t. */
export function money(v, { currency = 'US$', dp = 2, plain = false } = {}) {
  if (!isNum(v)) return 'n/a';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (plain) return sign + currency + a.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp });
  const units = [[1e12, 't'], [1e9, 'b'], [1e6, 'm'], [1e3, 'k']];
  for (const [scale, suffix] of units) {
    // Keep at least one decimal in the hundreds, so 149.3b and 150.0b stay
    // distinguishable rather than both collapsing to "150b".
    if (a >= scale) return `${sign}${currency}${dec(a / scale, a / scale >= 100 ? 1 : dp)}${suffix}`;
  }
  return `${sign}${currency}${trim(a, dp)}`;
}

/** Compact number without a currency prefix. */
export function num(v, dp = 2) {
  if (!isNum(v)) return 'n/a';
  return money(v, { currency: '', dp });
}

/** 0.2761 -> "27.6%". Pass `already: true` when the input is already 0-100. */
export function pct(v, { dp = 1, already = false, sign = false } = {}) {
  if (!isNum(v)) return 'n/a';
  const x = already ? v : v * 100;
  const s = sign && x > 0 ? '+' : '';
  return `${s}${trim(x, dp)}%`;
}

/** 35.31 -> "35.3x" */
export function mult(v, dp = 1) {
  return isNum(v) ? `${trim(v, dp)}x` : 'n/a';
}

/** Drop trailing zeros: 4.50 -> "4.5", 4.00 -> "4". */
export function trim(v, dp = 2) {
  if (!isNum(v)) return 'n/a';
  return Number(v.toFixed(dp)).toLocaleString('en-US', { maximumFractionDigits: dp });
}

/** Keep exactly `dp` decimals: 1.0033 -> "1.00". Use where a bare "1" would mislead. */
export function dec(v, dp = 2) {
  if (!isNum(v)) return 'n/a';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Price with the right number of decimals for its magnitude. */
export function price(v, currency = 'US$') {
  if (!isNum(v)) return 'n/a';
  // Sub-dollar prices need four decimals, but zero is not a penny stock — it
  // is an axis tick, and "US$0.0000" reads as a rounding artefact.
  if (v === 0) return `${currency}0`;
  const dp = Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 2 : 4;
  return currency + v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Compound annual growth rate from `first` to `last` over `years`. */
export function cagr(first, last, years) {
  if (!isNum(first) || !isNum(last) || !isNum(years) || years <= 0) return null;
  if (first <= 0 || last <= 0) return null;           // undefined for sign flips
  return Math.pow(last / first, 1 / years) - 1;
}

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/**
 * Sample standard deviation (n−1), for the consistency metrics.
 *
 * n−1 rather than n because five annual observations are a sample of the
 * company's behaviour, not the whole of it, and the population form would
 * report a company as steadier than the evidence supports.
 */
export function stdev(arr) {
  const xs = arr.filter(isNum);
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function sum(arr) { return arr.reduce((a, b) => a + (isNum(b) ? b : 0), 0); }

export function mean(arr) {
  const xs = arr.filter(isNum);
  return xs.length ? sum(xs) / xs.length : null;
}

export function median(arr) {
  const xs = arr.filter(isNum).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

/* ---------- dates --------------------------------------------------------- */

export function parseDate(d) {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

export function fmtDate(d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const t = parseDate(d);
  return t ? t.toLocaleDateString('en-GB', opts) : 'n/a';
}

export function fmtDateShort(d) {
  return fmtDate(d, { day: '2-digit', month: 'short' });
}

export function yearOf(d) {
  const t = parseDate(d);
  return t ? t.getUTCFullYear() : null;
}

/** "5h ago", "3 days ago" */
export function ago(d) {
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

export function initials(name) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('');
}

/** Signed class name for colouring deltas. */
export function signClass(v) {
  if (!isNum(v) || v === 0) return '';
  return v > 0 ? 'pos' : 'neg';
}

export function titleCase(s) {
  return String(s || '').replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
