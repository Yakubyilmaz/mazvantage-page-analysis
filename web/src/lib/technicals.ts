/* ==========================================================================
   Maz Vantage — signals computed from the price series alone

   Everything here reads one thing: a company's daily open, high, low, close
   and volume. Nothing here feeds a grade. The five factor grades are a
   reading of the accounts against the sector; this is a reading of the
   chart, and the two are kept apart on purpose — a stock can be cheap,
   profitable and falling, and a page that blended the two would hide that.

   The formulas are the textbook ones, named and written out, because a
   signal a reader cannot check is a signal they have to take on trust:
   - moving averages: simple, and exponential seeded with the simple average
     of its first window (alpha = 2 / (n + 1));
   - RSI, ATR and ADX use Wilder's smoothing (alpha = 1 / n), as he defined them;
   - Bollinger bands use the population standard deviation, as Bollinger does;
   - where a series is too short for a window, the value is null — never a
     shorter window quietly substituted.

   Pivot points, candlestick patterns and seasonality are here too, for the
   same reason: they are arithmetic on bars, and the tab that shows them says
   so rather than implying a forecast.
   ========================================================================== */

export interface Bar {
  date: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export type Series = (number | null)[];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/* ---------- reading the feed ------------------------------------------------------ */

/**
 * FMP's daily history as bars, oldest first, one per date. Rows without a
 * usable close are dropped; a row missing its high or low keeps its close and
 * leaves the others null, so the close-only indicators still run on it.
 */
export function barsFromFeed(payload: unknown): Bar[] {
  const list: any[] = Array.isArray(payload) ? payload : (payload as any)?.historical || [];
  const byDate = new Map<string, Bar>();
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  for (const row of list) {
    const date = String(row?.date || '').slice(0, 10);
    const close = num(row?.close ?? row?.price);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || close === null || close <= 0) continue;
    byDate.set(date, { date, open: num(row.open), high: num(row.high), low: num(row.low), close, volume: num(row.volume) });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Whether every bar carries open, high and low — candles and range indicators need them. */
export const hasOHLC = (bars: Bar[]) => bars.length > 0 && bars.every((b) => finite(b.open) && finite(b.high) && finite(b.low));

/* ---------- resampling ---------------------------------------------------------------- */

/** Monday of the ISO week a date falls in, as YYYY-MM-DD. */
function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Daily bars rolled up to weeks or months: first open, highest high, lowest
 * low, last close, summed volume, dated by the period's last session. A
 * period whose bars lack a high or low reports null for it rather than
 * pretending the known bars were the whole period.
 */
export function resample(bars: Bar[], period: 'week' | 'month'): Bar[] {
  const out: Bar[] = [];
  let key = '';
  let cur: Bar | null = null;
  let partial = false;
  const flush = () => {
    if (cur) out.push(partial ? { ...cur, high: null, low: null, open: cur.open } : cur);
  };
  for (const b of bars) {
    const k = period === 'week' ? weekStart(b.date) : b.date.slice(0, 7);
    if (k !== key) {
      flush();
      key = k;
      partial = !finite(b.high) || !finite(b.low);
      cur = { ...b };
      continue;
    }
    const c = cur!;
    if (!finite(b.high) || !finite(b.low) || !finite(c.high) || !finite(c.low)) partial = true;
    else { c.high = Math.max(c.high, b.high); c.low = Math.min(c.low, b.low); }
    c.close = b.close;
    c.date = b.date;
    c.volume = finite(c.volume) && finite(b.volume) ? c.volume + b.volume : c.volume ?? b.volume;
  }
  flush();
  return out;
}

/* ---------- moving averages -------------------------------------------------------------- */

export function sma(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0; // finite values in the window
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (finite(v)) { sum += v; count += 1; }
    if (i >= n) {
      const old = values[i - n];
      if (finite(old)) { sum -= old; count -= 1; }
    }
    if (i >= n - 1 && count === n) out[i] = sum / n;
  }
  return out;
}

/** Exponential average, seeded with the simple average of the first `n` finite values. */
export function ema(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const alpha = 2 / (n + 1);
  let prev: number | null = null;
  let seed: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!finite(v)) { if (prev === null) seed = []; continue; }
    if (prev === null) {
      seed.push(v);
      if (seed.length === n) { prev = seed.reduce((a, b) => a + b, 0) / n; out[i] = prev; }
      continue;
    }
    prev = prev + alpha * (v - prev);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing: the same idea with alpha = 1 / n, seeded with a simple average. */
export function wilder(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let prev: number | null = null;
  let seed: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!finite(v)) { if (prev === null) seed = []; continue; }
    if (prev === null) {
      seed.push(v);
      if (seed.length === n) { prev = seed.reduce((a, b) => a + b, 0) / n; out[i] = prev; }
      continue;
    }
    prev = prev + (v - prev) / n;
    out[i] = prev;
  }
  return out;
}

/* ---------- oscillators ------------------------------------------------------------------- */

/** Wilder's RSI: 100 − 100 / (1 + average gain / average loss). */
export function rsi(closes: Series, n = 14): Series {
  const gains: Series = [null];
  const losses: Series = [null];
  for (let i = 1; i < closes.length; i += 1) {
    const a = closes[i - 1];
    const b = closes[i];
    if (!finite(a) || !finite(b)) { gains.push(null); losses.push(null); continue; }
    gains.push(Math.max(0, b - a));
    losses.push(Math.max(0, a - b));
  }
  const g = wilder(gains, n);
  const l = wilder(losses, n);
  return closes.map((_, i) => {
    const up = g[i];
    const down = l[i];
    if (!finite(up) || !finite(down)) return null;
    if (down === 0) return up === 0 ? 50 : 100;
    return 100 - 100 / (1 + up / down);
  });
}

export interface Macd { macd: Series; signal: Series; histogram: Series }

/** MACD line (EMA fast − EMA slow), its signal (EMA of the line), and the gap between them. */
export function macd(closes: Series, fast = 12, slow = 26, signalN = 9): Macd {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line: Series = closes.map((_, i) => (finite(f[i]) && finite(s[i]) ? f[i]! - s[i]! : null));
  const signal = ema(line, signalN);
  return { macd: line, signal, histogram: line.map((v, i) => (finite(v) && finite(signal[i]) ? v - signal[i]! : null)) };
}

export interface Bands { middle: Series; upper: Series; lower: Series }

/** Bollinger bands: the simple average ± k population standard deviations. */
export function bollinger(closes: Series, n = 20, k = 2): Bands {
  const middle = sma(closes, n);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i += 1) {
    const m = middle[i];
    if (!finite(m)) continue;
    let sq = 0;
    for (let j = i - n + 1; j <= i; j += 1) sq += (closes[j]! - m) ** 2;
    const sd = Math.sqrt(sq / n);
    upper[i] = m + k * sd;
    lower[i] = m - k * sd;
  }
  return { middle, upper, lower };
}

const highs = (bars: Bar[]) => bars.map((b) => b.high);
const lows = (bars: Bar[]) => bars.map((b) => b.low);
const closesOf = (bars: Bar[]): Series => bars.map((b) => b.close);

function rollingExtreme(values: Series, n: number, pick: (a: number, b: number) => number): Series {
  return values.map((_, i) => {
    if (i < n - 1) return null;
    let best: number | null = null;
    for (let j = i - n + 1; j <= i; j += 1) {
      const v = values[j];
      if (!finite(v)) return null;
      best = best === null ? v : pick(best, v);
    }
    return best;
  });
}

/** Stochastic %K over `n` bars, and %D its simple average over `d`. */
export function stochastic(bars: Bar[], n = 9, d = 6): { k: Series; d: Series } {
  const hh = rollingExtreme(highs(bars), n, Math.max);
  const ll = rollingExtreme(lows(bars), n, Math.min);
  const k: Series = bars.map((b, i) => {
    const hi = hh[i];
    const lo = ll[i];
    if (!finite(hi) || !finite(lo)) return null;
    return hi === lo ? 50 : (100 * (b.close - lo)) / (hi - lo);
  });
  return { k, d: sma(k, d) };
}

/** Stochastic applied to RSI rather than to price, 0–100. */
export function stochRsi(closes: Series, n = 14): Series {
  const r = rsi(closes, n);
  const hh = rollingExtreme(r, n, Math.max);
  const ll = rollingExtreme(r, n, Math.min);
  return r.map((v, i) => {
    if (!finite(v) || !finite(hh[i]) || !finite(ll[i])) return null;
    return hh[i] === ll[i] ? 50 : (100 * (v - ll[i]!)) / (hh[i]! - ll[i]!);
  });
}

/** Williams %R: where the close sits in the `n`-bar range, from 0 (top) to −100 (bottom). */
export function williamsR(bars: Bar[], n = 14): Series {
  const hh = rollingExtreme(highs(bars), n, Math.max);
  const ll = rollingExtreme(lows(bars), n, Math.min);
  return bars.map((b, i) => {
    const hi = hh[i];
    const lo = ll[i];
    if (!finite(hi) || !finite(lo)) return null;
    return hi === lo ? -50 : (-100 * (hi - b.close)) / (hi - lo);
  });
}

/** Commodity Channel Index: (typical price − its average) / (0.015 × mean deviation). */
export function cci(bars: Bar[], n = 14): Series {
  const tp: Series = bars.map((b) => (finite(b.high) && finite(b.low) ? (b.high + b.low + b.close) / 3 : null));
  const avg = sma(tp, n);
  return tp.map((v, i) => {
    const m = avg[i];
    if (!finite(v) || !finite(m)) return null;
    let dev = 0;
    for (let j = i - n + 1; j <= i; j += 1) dev += Math.abs(tp[j]! - m);
    dev /= n;
    return dev === 0 ? 0 : (v - m) / (0.015 * dev);
  });
}

/** True range, and Wilder's average of it. */
export function atr(bars: Bar[], n = 14): Series {
  const tr: Series = bars.map((b, i) => {
    if (!finite(b.high) || !finite(b.low)) return null;
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  return wilder(tr, n);
}

/** Wilder's directional movement: +DI, −DI and ADX. */
export function adx(bars: Bar[], n = 14): { adx: Series; plusDI: Series; minusDI: Series } {
  const plusDM: Series = [null];
  const minusDM: Series = [null];
  const tr: Series = [null];
  for (let i = 1; i < bars.length; i += 1) {
    const b = bars[i];
    const p = bars[i - 1];
    if (!finite(b.high) || !finite(b.low) || !finite(p.high) || !finite(p.low)) { plusDM.push(null); minusDM.push(null); tr.push(null); continue; }
    const up = b.high - p.high;
    const down = p.low - b.low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)));
  }
  const sTR = wilder(tr, n);
  const sPlus = wilder(plusDM, n);
  const sMinus = wilder(minusDM, n);
  const plusDI: Series = bars.map((_, i) => (finite(sTR[i]) && sTR[i]! > 0 && finite(sPlus[i]) ? (100 * sPlus[i]!) / sTR[i]! : null));
  const minusDI: Series = bars.map((_, i) => (finite(sTR[i]) && sTR[i]! > 0 && finite(sMinus[i]) ? (100 * sMinus[i]!) / sTR[i]! : null));
  const dx: Series = bars.map((_, i) => {
    const a = plusDI[i];
    const b = minusDI[i];
    if (!finite(a) || !finite(b)) return null;
    return a + b === 0 ? 0 : (100 * Math.abs(a - b)) / (a + b);
  });
  return { adx: wilder(dx, n), plusDI, minusDI };
}

/** Rate of change: the percentage move over `n` bars. */
export function roc(closes: Series, n = 12): Series {
  return closes.map((v, i) => (i >= n && finite(v) && finite(closes[i - n]) && closes[i - n]! > 0 ? (100 * (v - closes[i - n]!)) / closes[i - n]! : null));
}

/** Larry Williams' Ultimate Oscillator over 7, 14 and 28 bars, weighted 4:2:1. */
export function ultimate(bars: Bar[], a = 7, b = 14, c = 28): Series {
  const bp: Series = [null];
  const tr: Series = [null];
  for (let i = 1; i < bars.length; i += 1) {
    const x = bars[i];
    const pc = bars[i - 1].close;
    if (!finite(x.high) || !finite(x.low)) { bp.push(null); tr.push(null); continue; }
    const low = Math.min(x.low, pc);
    bp.push(x.close - low);
    tr.push(Math.max(x.high, pc) - low);
  }
  const sum = (s: Series, n: number, i: number) => {
    let t = 0;
    for (let j = i - n + 1; j <= i; j += 1) { if (!finite(s[j])) return null; t += s[j]!; }
    return t;
  };
  return bars.map((_, i) => {
    if (i < c) return null;
    const parts = [a, b, c].map((n) => { const x = sum(bp, n, i); const y = sum(tr, n, i); return finite(x) && finite(y) && y > 0 ? x / y : null; });
    if (parts.some((p) => p === null)) return null;
    return (100 * (4 * parts[0]! + 2 * parts[1]! + parts[2]!)) / 7;
  });
}

/** Elder's bull and bear power: the high and the low against a 13-bar EMA. */
export function bullBearPower(bars: Bar[], n = 13): { bull: Series; bear: Series } {
  const e = ema(closesOf(bars), n);
  return {
    bull: bars.map((x, i) => (finite(x.high) && finite(e[i]) ? x.high - e[i]! : null)),
    bear: bars.map((x, i) => (finite(x.low) && finite(e[i]) ? x.low - e[i]! : null)),
  };
}

/* ---------- the summary --------------------------------------------------------------------- */

export type Action = 'Buy' | 'Sell' | 'Neutral' | 'Overbought' | 'Oversold';

export interface Signal { name: string; value: number | null; action: Action | null; rule: string }

export interface TechnicalSummary {
  price: number | null;
  date: string | null;
  movingAverages: { period: number; simple: Signal; exponential: Signal }[];
  oscillators: Signal[];
  tally: { ma: Tally; osc: Tally; all: Tally };
  verdict: { ma: string; osc: string; all: string };
}

export interface Tally { buy: number; sell: number; neutral: number; counted: number }

const last = (s: Series): number | null => { const v = s[s.length - 1]; return finite(v) ? v : null; };

export const MA_PERIODS = [5, 10, 20, 50, 100, 200];

/** Buy when the price is above the average, sell when below. */
function maSignal(name: string, price: number, value: number | null): Signal {
  return {
    name, value,
    action: value === null ? null : price > value ? 'Buy' : price < value ? 'Sell' : 'Neutral',
    rule: 'Buy when the price is above the average, sell when below.',
  };
}

function band(value: number | null, over: number, under: number, mid: number, name: string, rule: string): Signal {
  if (value === null) return { name, value, action: null, rule };
  const action: Action = value > over ? 'Overbought' : value < under ? 'Oversold' : value > mid ? 'Buy' : value < mid ? 'Sell' : 'Neutral';
  return { name, value, action, rule };
}

function tallyOf(signals: Signal[]): Tally {
  const t: Tally = { buy: 0, sell: 0, neutral: 0, counted: 0 };
  for (const s of signals) {
    if (!s.action) continue;
    t.counted += 1;
    if (s.action === 'Buy') t.buy += 1;
    else if (s.action === 'Sell') t.sell += 1;
    else t.neutral += 1; // Overbought and oversold are warnings, not votes.
  }
  return t;
}

/**
 * The verdict from a tally: the net share of buy over sell votes among the
 * signals that could be computed. Strong at a half or more either way,
 * a lean at a tenth, neutral in between. Printed on the page as written here.
 */
export function verdictOf(t: Tally): string {
  if (!t.counted) return 'Not enough history';
  const net = (t.buy - t.sell) / t.counted;
  if (net >= 0.5) return 'Strong Buy';
  if (net >= 0.1) return 'Buy';
  if (net <= -0.5) return 'Strong Sell';
  if (net <= -0.1) return 'Sell';
  return 'Neutral';
}

export const VERDICT_RULE = 'Net votes (buy minus sell) over the signals that computed: a half or more either way is Strong, a tenth or more is a lean, anything nearer zero is Neutral. Overbought and oversold readings count as neutral.';

export function technicalSummary(bars: Bar[]): TechnicalSummary {
  const closes = closesOf(bars);
  const price = bars.length ? bars[bars.length - 1].close : null;
  const date = bars.length ? bars[bars.length - 1].date : null;
  const movingAverages = MA_PERIODS.map((period) => ({
    period,
    simple: maSignal(`SMA ${period}`, price ?? NaN, last(sma(closes, period))),
    exponential: maSignal(`EMA ${period}`, price ?? NaN, last(ema(closes, period))),
  }));

  const st = stochastic(bars, 9, 6);
  const k = last(st.k);
  const dLine = last(st.d);
  const m = macd(closes);
  const macdLine = last(m.macd);
  const macdSignal = last(m.signal);
  const dmi = adx(bars, 14);
  const adxV = last(dmi.adx);
  const plus = last(dmi.plusDI);
  const minus = last(dmi.minusDI);
  const bb = bullBearPower(bars, 13);
  const bull = last(bb.bull);
  const bear = last(bb.bear);
  const rocV = last(roc(closes, 12));
  const atrV = last(atr(bars, 14));

  const oscillators: Signal[] = [
    band(last(rsi(closes, 14)), 70, 30, 50, 'RSI (14)', 'Above 70 overbought, below 30 oversold; otherwise buy above 50, sell below.'),
    {
      name: 'Stochastic (9, 6)', value: k,
      action: k === null || dLine === null ? null : k > 80 ? 'Overbought' : k < 20 ? 'Oversold' : k > dLine ? 'Buy' : k < dLine ? 'Sell' : 'Neutral',
      rule: '%K above 80 overbought, below 20 oversold; otherwise buy when %K is above its 6-bar average %D.',
    },
    band(last(stochRsi(closes, 14)), 80, 20, 50, 'Stochastic RSI (14)', 'Above 80 overbought, below 20 oversold; otherwise buy above 50, sell below.'),
    {
      name: 'MACD (12, 26, 9)', value: macdLine,
      action: macdLine === null || macdSignal === null ? null : macdLine > macdSignal ? 'Buy' : macdLine < macdSignal ? 'Sell' : 'Neutral',
      rule: 'Buy when the MACD line is above its 9-bar signal line, sell when below.',
    },
    {
      name: 'ADX (14)', value: adxV,
      action: adxV === null || plus === null || minus === null ? null : adxV < 20 ? 'Neutral' : plus > minus ? 'Buy' : 'Sell',
      rule: 'Below 20 there is no trend to follow (neutral); above it, buy when +DI leads −DI, sell when −DI leads.',
    },
    band(last(williamsR(bars, 14)), -20, -80, -50, 'Williams %R (14)', 'Above −20 overbought, below −80 oversold; otherwise buy above −50, sell below.'),
    band(last(cci(bars, 14)), 100, -100, 0, 'CCI (14)', 'Above 100 overbought, below −100 oversold; otherwise buy above zero, sell below.'),
    {
      name: 'ROC (12)', value: rocV,
      action: rocV === null ? null : rocV > 0 ? 'Buy' : rocV < 0 ? 'Sell' : 'Neutral',
      rule: 'Buy when the price is higher than 12 bars ago, sell when lower.',
    },
    band(last(ultimate(bars)), 70, 30, 50, 'Ultimate Oscillator (7, 14, 28)', 'Above 70 overbought, below 30 oversold; otherwise buy above 50, sell below.'),
    {
      name: 'Bull/Bear Power (13)', value: bull !== null && bear !== null ? bull + bear : null,
      action: bull === null || bear === null ? null : bull + bear > 0 ? 'Buy' : bull + bear < 0 ? 'Sell' : 'Neutral',
      rule: 'Elder’s bull power plus bear power: buy when the sum is positive, sell when negative.',
    },
    {
      name: 'ATR (14)', value: atrV, action: atrV === null ? null : 'Neutral',
      rule: 'Average true range measures how far the price moves, not which way — shown for scale, counted as neutral.',
    },
  ];

  const maSignals = movingAverages.flatMap((r) => [r.simple, r.exponential]);
  const ma = tallyOf(maSignals);
  const osc = tallyOf(oscillators);
  const all = tallyOf([...maSignals, ...oscillators]);
  return { price, date, movingAverages, oscillators, tally: { ma, osc, all }, verdict: { ma: verdictOf(ma), osc: verdictOf(osc), all: verdictOf(all) } };
}

/* ---------- pivot points --------------------------------------------------------------------- */

export interface PivotSet { name: string; s3: number | null; s2: number | null; s1: number | null; p: number | null; r1: number | null; r2: number | null; r3: number | null }

/**
 * The five published pivot conventions, from one completed period's open,
 * high, low and close. DeMark's needs the open; without one it is null.
 */
export function pivots(bar: Pick<Bar, 'open' | 'high' | 'low' | 'close'>): PivotSet[] {
  const { open: o, high: h, low: l, close: c } = bar;
  if (!finite(h) || !finite(l) || !finite(c)) return [];
  const range = h - l;
  const p = (h + l + c) / 3;
  const classic: PivotSet = { name: 'Classic', p, r1: 2 * p - l, s1: 2 * p - h, r2: p + range, s2: p - range, r3: h + 2 * (p - l), s3: l - 2 * (h - p) };
  const fibonacci: PivotSet = { name: 'Fibonacci', p, r1: p + 0.382 * range, s1: p - 0.382 * range, r2: p + 0.618 * range, s2: p - 0.618 * range, r3: p + range, s3: p - range };
  const camarilla: PivotSet = {
    name: 'Camarilla', p,
    r1: c + (range * 1.1) / 12, s1: c - (range * 1.1) / 12,
    r2: c + (range * 1.1) / 6, s2: c - (range * 1.1) / 6,
    r3: c + (range * 1.1) / 4, s3: c - (range * 1.1) / 4,
  };
  const wp = (h + l + 2 * c) / 4;
  const woodie: PivotSet = { name: 'Woodie’s', p: wp, r1: 2 * wp - l, s1: 2 * wp - h, r2: wp + range, s2: wp - range, r3: h + 2 * (wp - l), s3: l - 2 * (h - wp) };
  let demark: PivotSet = { name: 'DeMark’s', p: null, r1: null, s1: null, r2: null, s2: null, r3: null, s3: null };
  if (finite(o)) {
    const x = c < o ? h + 2 * l + c : c > o ? 2 * h + l + c : h + l + 2 * c;
    demark = { name: 'DeMark’s', p: x / 4, r1: x / 2 - l, s1: x / 2 - h, r2: null, s2: null, r3: null, s3: null };
  }
  return [classic, fibonacci, camarilla, woodie, demark];
}

/* ---------- candlestick patterns ---------------------------------------------------------------- */

export type Reliability = 'Low' | 'Medium' | 'High';

export interface PatternHit {
  name: string;
  date: string;
  /** 0 is the latest bar. */
  barsAgo: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  reliability: Reliability;
}

interface Shape { o: number; h: number; l: number; c: number; body: number; range: number; upper: number; lower: number; bull: boolean; bear: boolean }

const shape = (b: Bar): Shape | null => {
  if (!finite(b.open) || !finite(b.high) || !finite(b.low)) return null;
  const o = b.open;
  const c = b.close;
  const range = b.high - b.low;
  return {
    o, h: b.high, l: b.low, c, range,
    body: Math.abs(c - o),
    upper: b.high - Math.max(o, c),
    lower: Math.min(o, c) - b.low,
    bull: c > o, bear: c < o,
  };
};

/**
 * The trend a pattern appears in, read the plain way: the close before the
 * pattern against its 10-bar average. A hammer is only a hammer after a fall.
 */
function trendBefore(bars: Bar[], closesAvg: Series, i: number): 'up' | 'down' | null {
  const j = i - 1;
  if (j < 0 || !finite(closesAvg[j])) return null;
  return bars[j].close > closesAvg[j]! ? 'up' : bars[j].close < closesAvg[j]! ? 'down' : null;
}

/**
 * The common patterns over the last `lookback` bars. Reliability is the
 * convention the pattern literature assigns (single candles low, two-bar
 * reversals medium, three-bar formations high) — a label from the literature,
 * not a hit rate measured here.
 */
export function candlePatterns(bars: Bar[], lookback = 30): PatternHit[] {
  const out: PatternHit[] = [];
  const avg = sma(closesOf(bars), 10);
  const start = Math.max(2, bars.length - lookback);
  for (let i = start; i < bars.length; i += 1) {
    const s = shape(bars[i]);
    const p = shape(bars[i - 1]);
    const q = shape(bars[i - 2]);
    if (!s || s.range <= 0) continue;
    const trend = trendBefore(bars, avg, i);
    const hit = (name: string, direction: PatternHit['direction'], reliability: Reliability) =>
      out.push({ name, date: bars[i].date, barsAgo: bars.length - 1 - i, direction, reliability });

    if (s.body <= 0.1 * s.range) hit('Doji', 'neutral', 'Low');
    const smallBody = s.body <= 0.35 * s.range && s.body > 0;
    if (smallBody && s.lower >= 2 * s.body && s.upper <= 0.15 * s.range) {
      if (trend === 'down') hit('Hammer', 'bullish', 'Low');
      if (trend === 'up') hit('Hanging Man', 'bearish', 'Low');
    }
    if (smallBody && s.upper >= 2 * s.body && s.lower <= 0.15 * s.range) {
      if (trend === 'down') hit('Inverted Hammer', 'bullish', 'Low');
      if (trend === 'up') hit('Shooting Star', 'bearish', 'Low');
    }
    if (p && p.body > 0) {
      const pTop = Math.max(p.o, p.c);
      const pBot = Math.min(p.o, p.c);
      const sTop = Math.max(s.o, s.c);
      const sBot = Math.min(s.o, s.c);
      if (p.bear && s.bull && sTop >= pTop && sBot <= pBot && s.body > p.body) hit('Bullish Engulfing', 'bullish', 'Medium');
      if (p.bull && s.bear && sTop >= pTop && sBot <= pBot && s.body > p.body) hit('Bearish Engulfing', 'bearish', 'Medium');
      if (p.bear && s.bull && sTop < pTop && sBot > pBot && p.body > 0.5 * p.range) hit('Bullish Harami', 'bullish', 'Low');
      if (p.bull && s.bear && sTop < pTop && sBot > pBot && p.body > 0.5 * p.range) hit('Bearish Harami', 'bearish', 'Low');
      const pMid = (p.o + p.c) / 2;
      if (p.bear && p.body > 0.5 * p.range && s.bull && s.o < p.c && s.c > pMid && s.c < p.o) hit('Piercing Line', 'bullish', 'Medium');
      if (p.bull && p.body > 0.5 * p.range && s.bear && s.o > p.c && s.c < pMid && s.c > p.o) hit('Dark Cloud Cover', 'bearish', 'Medium');
    }
    if (p && q && q.body > 0) {
      const qMid = (q.o + q.c) / 2;
      const middleSmall = p.body <= 0.3 * q.body;
      if (q.bear && q.body > 0.5 * q.range && middleSmall && Math.max(p.o, p.c) < q.c && s.bull && s.c > qMid) hit('Morning Star', 'bullish', 'High');
      if (q.bull && q.body > 0.5 * q.range && middleSmall && Math.min(p.o, p.c) > q.c && s.bear && s.c < qMid) hit('Evening Star', 'bearish', 'High');
      const soldiers = [q, p, s].every((x) => x.bull && x.body > 0.5 * x.range && x.upper <= 0.25 * x.range)
        && p.c > q.c && s.c > p.c && p.o > q.o && p.o < q.c && s.o > p.o && s.o < p.c;
      if (soldiers) hit('Three White Soldiers', 'bullish', 'High');
      const crows = [q, p, s].every((x) => x.bear && x.body > 0.5 * x.range && x.lower <= 0.25 * x.range)
        && p.c < q.c && s.c < p.c && p.o < q.o && p.o > q.c && s.o < p.o && s.o > p.c;
      if (crows) hit('Three Black Crows', 'bearish', 'High');
    }
  }
  return out.sort((a, b) => a.barsAgo - b.barsAgo);
}

/* ---------- seasonality ------------------------------------------------------------------------------ */

export interface MonthStat {
  month: number; // 1–12
  years: number;
  average: number | null;
  median: number | null;
  positive: number | null; // share of years it rose, 0–1
  best: number | null;
  worst: number | null;
}

export interface Seasonality {
  /** Every complete month: year, month, return as a fraction. */
  cells: { year: number; month: number; ret: number }[];
  months: MonthStat[];
  years: number[];
  from: string | null;
  to: string | null;
}

/**
 * Month-on-month returns from daily closes: each month's last close over the
 * previous month's last close. The month in progress is left out — a
 * half-finished October is not an October — and so is the first month in the
 * series, which has nothing before it to be measured against.
 */
export function seasonality(bars: Bar[], today = new Date()): Seasonality {
  const monthEnd = new Map<string, { date: string; close: number }>();
  for (const b of bars) monthEnd.set(b.date.slice(0, 7), { date: b.date, close: b.close });
  const current = today.toISOString().slice(0, 7);
  const keys = [...monthEnd.keys()].sort().filter((k) => k < current);
  const cells: Seasonality['cells'] = [];
  for (let i = 1; i < keys.length; i += 1) {
    const prev = monthEnd.get(keys[i - 1])!;
    const cur = monthEnd.get(keys[i])!;
    // Consecutive months only: a gap in the history is not a one-month return.
    const [py, pm] = keys[i - 1].split('-').map(Number);
    const [cy, cm] = keys[i].split('-').map(Number);
    if ((cy - py) * 12 + (cm - pm) !== 1 || prev.close <= 0) continue;
    cells.push({ year: cy, month: cm, ret: cur.close / prev.close - 1 });
  }
  const months: MonthStat[] = Array.from({ length: 12 }, (_, i) => {
    const rets = cells.filter((c) => c.month === i + 1).map((c) => c.ret).sort((a, b) => a - b);
    const n = rets.length;
    return {
      month: i + 1,
      years: n,
      average: n ? rets.reduce((a, b) => a + b, 0) / n : null,
      median: n ? (n % 2 ? rets[(n - 1) / 2] : (rets[n / 2 - 1] + rets[n / 2]) / 2) : null,
      positive: n ? rets.filter((r) => r > 0).length / n : null,
      best: n ? rets[n - 1] : null,
      worst: n ? rets[0] : null,
    };
  });
  return {
    cells,
    months,
    years: [...new Set(cells.map((c) => c.year))].sort((a, b) => b - a),
    from: keys[1] ?? null,
    to: keys[keys.length - 1] ?? null,
  };
}
