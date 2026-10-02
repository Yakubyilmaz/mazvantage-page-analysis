/* ==========================================================================
   Maz Vantage — a watchlist as a portfolio: cost, gain, a history and its risk

   Everything here is arithmetic on what the reader entered — dated purchase
   lots — and on daily closes. The rules it keeps are the watchlist's own:

   - **A size or a cost is never invented.** A lot without a price has no
     cost basis, so a holding with one is shown with its value and without a
     gain; a lot without a date cannot be placed in a history and is named as
     left out of it rather than assumed to have been held all along.
   - **Nothing weights by value on a partial list.** Totals and weights are
     printed only when every holding is sized; otherwise the page says how
     many are.
   - **Return is time-weighted.** Money added on a day is taken out of that
     day's return, so buying more is not mistaken for performance. That is
     the number comparable with an index; the money-weighted picture (value
     against what was put in) is drawn beside it.
   ========================================================================== */

import { parseCsv, parseDay, parseNumber } from './csv';
import { cleanSymbol, isSymbol, sharesHeld, type Holding, type Lot } from './watchlists';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/* ---------- one holding ------------------------------------------------------------ */

export interface PositionView {
  symbol: string;
  shares: number | null;
  lots: Lot[];
  /** What was paid in total — only when every lot carries a price. */
  costBasis: number | null;
  avgCost: number | null;
  /** Lots that carry no price, and so no cost. */
  unpriced: number;
  value: number | null;
  gain: number | null;
  gainPct: number | null;
  firstDate: string | null;
}

export function positionOf(symbol: string, holding: Holding | null | undefined, price: number | null | undefined): PositionView {
  const lots = holding?.lots || [];
  const shares = sharesHeld(holding);
  const priced = lots.filter((l) => finite(l.price));
  const unpriced = lots.length - priced.length;
  const costBasis = lots.length && !unpriced ? priced.reduce((a, l) => a + l.shares * (l.price as number), 0) : null;
  const value = finite(shares) && finite(price) ? shares * price : null;
  const gain = finite(value) && finite(costBasis) ? value - costBasis : null;
  const dates = lots.map((l) => l.date).filter((d): d is string => !!d).sort();
  return {
    symbol,
    shares,
    lots,
    costBasis,
    avgCost: finite(costBasis) && finite(shares) && shares > 0 ? costBasis / shares : null,
    unpriced,
    value,
    gain,
    gainPct: finite(gain) && finite(costBasis) && costBasis > 0 ? gain / costBasis : null,
    firstDate: dates[0] ?? null,
  };
}

export interface PortfolioTotals {
  /** Holdings with a size, of all holdings. */
  sized: number;
  holdings: number;
  /** Every holding sized: totals and weights are allowed. */
  complete: boolean;
  /** Every sized holding also has a full cost basis: the gain total is allowed. */
  costComplete: boolean;
  value: number | null;
  cost: number | null;
  gain: number | null;
  gainPct: number | null;
  /** The day's move in money, from each holding's percentage change. */
  dayGain: number | null;
}

/** `dayPct` is the session's change in per cent (1.5 = +1.5%), as quotes carry it. */
export function portfolioTotals(positions: PositionView[], dayPct: Record<string, number | null | undefined>): PortfolioTotals {
  const sized = positions.filter((p) => finite(p.value));
  const complete = positions.length > 0 && sized.length === positions.length;
  const costComplete = complete && positions.every((p) => finite(p.costBasis));
  const value = complete ? sized.reduce((a, p) => a + (p.value as number), 0) : null;
  const cost = costComplete ? positions.reduce((a, p) => a + (p.costBasis as number), 0) : null;
  const gain = finite(value) && finite(cost) ? value - cost : null;
  let dayGain: number | null = null;
  if (complete && positions.every((p) => finite(dayPct[p.symbol]))) {
    // Today's value over (1 + move) is yesterday's; the difference is the day's money.
    dayGain = positions.reduce((a, p) => {
      const move = (dayPct[p.symbol] as number) / 100;
      return a + (p.value as number) - (p.value as number) / (1 + move);
    }, 0);
  }
  return {
    sized: sized.length, holdings: positions.length, complete, costComplete,
    value, cost, gain, gainPct: finite(gain) && finite(cost) && cost > 0 ? gain / cost : null, dayGain,
  };
}

/* ---------- the history ------------------------------------------------------------------ */

export interface HistoryPoint {
  date: string;
  /** What the holdings were worth at that day's close. */
  value: number;
  /** Money put in so far: each lot at the price paid. */
  invested: number;
  /** Time-weighted return index, 1 at the first purchase. */
  twr: number;
}

export interface PortfolioHistory {
  points: HistoryPoint[];
  /** Symbols with lots that carry no date — left out of the history, never assumed held. */
  undated: string[];
  /** Symbols whose price history did not come back — left out too, and named. */
  unpriced: string[];
}

type Closes = { date: string; close: number }[];

/**
 * Value, money in, and a time-weighted index, one point per trading day from
 * the first dated purchase. A lot bought without a price is counted as bought
 * at that day's close, so it moves the value but adds no invented gain.
 */
export function portfolioHistory(lots: Record<string, Lot[]>, closes: Record<string, Closes>): PortfolioHistory {
  const undated = Object.entries(lots).filter(([, ls]) => ls.some((l) => !l.date)).map(([s]) => s);
  const unpriced = Object.entries(lots).filter(([s, ls]) => ls.some((l) => l.date) && !(closes[s]?.length)).map(([s]) => s);
  const dated = Object.entries(lots)
    .filter(([s]) => closes[s]?.length)
    .flatMap(([s, ls]) => ls.filter((l) => l.date).map((l) => ({ ...l, symbol: s, date: l.date as string })))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!dated.length) return { points: [], undated, unpriced };

  const start = dated[0].date;
  const symbols = [...new Set(dated.map((l) => l.symbol))];
  const dates = [...new Set(symbols.flatMap((s) => closes[s].map((c) => c.date)))].filter((d) => d >= start).sort();
  const cursor = Object.fromEntries(symbols.map((s) => [s, 0]));
  const lastClose: Record<string, number | null> = Object.fromEntries(symbols.map((s) => [s, null]));
  const held: Record<string, number> = Object.fromEntries(symbols.map((s) => [s, 0]));
  let lotAt = 0;
  let invested = 0;
  let prevValue = 0;
  let index = 1;
  const points: HistoryPoint[] = [];

  for (const date of dates) {
    for (const s of symbols) {
      const series = closes[s];
      while (cursor[s] < series.length && series[cursor[s]].date <= date) { lastClose[s] = series[cursor[s]].close; cursor[s] += 1; }
    }
    // Buys up to and including today: shares join the holding, their cost the money in.
    let flow = 0;
    while (lotAt < dated.length && dated[lotAt].date <= date) {
      const l = dated[lotAt];
      held[l.symbol] += l.shares;
      const paid = finite(l.price) ? l.price : lastClose[l.symbol];
      if (finite(paid)) flow += l.shares * paid;
      lotAt += 1;
    }
    invested += flow;
    let value = 0;
    for (const s of symbols) if (held[s] > 0 && finite(lastClose[s])) value += held[s] * (lastClose[s] as number);
    if (prevValue > 0) index *= (value - flow) / prevValue;
    else if (flow > 0) index = value / flow;
    points.push({ date, value, invested, twr: index });
    prevValue = value;
  }
  return { points, undated, unpriced };
}

/* ---------- risk --------------------------------------------------------------------------- */

export interface RiskStats {
  days: number;
  from: string | null;
  annualReturn: number | null;
  volatility: number | null;
  sharpe: number | null;
  beta: number | null;
  maxDrawdown: number | null;
  benchmarkReturn: number | null;
}

const stdev = (xs: number[]) => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Risk over the last `window` trading days of the time-weighted index —
 * annualised with 252 sessions a year. Needs sixty days at least: fewer and
 * a volatility or a beta is mostly noise, so none is printed.
 */
export function riskStats(points: HistoryPoint[], benchmark: Closes, riskFree: number, window = 252): RiskStats {
  const pts = points.slice(-window - 1);
  const empty: RiskStats = { days: 0, from: null, annualReturn: null, volatility: null, sharpe: null, beta: null, maxDrawdown: null, benchmarkReturn: null };
  if (pts.length < 61) return { ...empty, days: Math.max(0, pts.length - 1), from: pts[0]?.date ?? null };
  const rets: number[] = [];
  for (let i = 1; i < pts.length; i += 1) if (pts[i - 1].twr > 0) rets.push(pts[i].twr / pts[i - 1].twr - 1);
  const n = rets.length;
  const growth = pts[pts.length - 1].twr / pts[0].twr;
  const annualReturn = growth ** (252 / n) - 1;
  const sd = stdev(rets);
  const volatility = finite(sd) ? sd * Math.sqrt(252) : null;
  let peak = pts[0].twr;
  let maxDrawdown = 0;
  for (const p of pts) { peak = Math.max(peak, p.twr); maxDrawdown = Math.min(maxDrawdown, p.twr / peak - 1); }

  // Beta on the days both series have, from close to close.
  const bench = new Map(benchmark.map((b) => [b.date, b.close]));
  const paired: [number, number][] = [];
  for (let i = 1; i < pts.length; i += 1) {
    const a = bench.get(pts[i - 1].date);
    const b = bench.get(pts[i].date);
    if (finite(a) && finite(b) && a > 0 && pts[i - 1].twr > 0) paired.push([pts[i].twr / pts[i - 1].twr - 1, b / a - 1]);
  }
  let beta: number | null = null;
  if (paired.length >= 60) {
    const mp = paired.reduce((s, [p]) => s + p, 0) / paired.length;
    const mb = paired.reduce((s, [, b]) => s + b, 0) / paired.length;
    const cov = paired.reduce((s, [p, b]) => s + (p - mp) * (b - mb), 0) / (paired.length - 1);
    const varB = paired.reduce((s, [, b]) => s + (b - mb) ** 2, 0) / (paired.length - 1);
    beta = varB > 0 ? cov / varB : null;
  }
  const b0 = bench.get(pts[0].date);
  const b1 = bench.get(pts[pts.length - 1].date);
  return {
    days: n,
    from: pts[0].date,
    annualReturn,
    volatility,
    sharpe: finite(volatility) && volatility > 0 ? (annualReturn - riskFree) / volatility : null,
    beta,
    maxDrawdown,
    benchmarkReturn: finite(b0) && finite(b1) && b0 > 0 ? (b1 / b0) ** (252 / n) - 1 : null,
  };
}

/* ---------- import ------------------------------------------------------------------------- */

export interface ImportRow { line: number; symbol: string; shares: number; price: number | null; date: string | null }
export interface ImportResult {
  rows: ImportRow[];
  errors: { line: number; message: string }[];
  /** Which header each field was read from, or null when there was no header. */
  columns: Partial<Record<'symbol' | 'shares' | 'price' | 'total' | 'date', string>> | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const HEADERS: Record<'symbol' | 'shares' | 'price' | 'total' | 'date', string[]> = {
  symbol: ['symbol', 'ticker', 'tickersymbol', 'security', 'securitysymbol', 'instrument', 'stock', 'code'],
  shares: ['shares', 'quantity', 'qty', 'units', 'position', 'sharesheld', 'numberofshares', 'noofshares'],
  price: ['price', 'pricepaid', 'purchaseprice', 'averagecost', 'avgcost', 'costpershare', 'averageprice', 'avgprice', 'unitcost',
    'costbasispershare', 'buyprice', 'tradeprice', 'averagecostbasis', 'avgcostbasis', 'pricepershare', 'unitprice', 'cost/share'],
  total: ['costbasis', 'totalcost', 'cost', 'bookvalue', 'totalcostbasis', 'amountinvested', 'invested'],
  date: ['date', 'purchasedate', 'tradedate', 'acquired', 'dateacquired', 'opendate', 'buydate', 'acquisitiondate'],
};

function findColumns(header: string[]) {
  const n = header.map(norm);
  const at = (names: string[]) => { const i = n.findIndex((h) => names.map(norm).includes(h)); return i >= 0 ? i : null; };
  return { symbol: at(HEADERS.symbol), shares: at(HEADERS.shares), price: at(HEADERS.price), total: at(HEADERS.total), date: at(HEADERS.date) };
}

/**
 * Holdings from a broker's export or a spreadsheet. A header row is looked
 * for by name; without one, the columns are read as symbol, shares, price,
 * date in that order. A row that is not a holding — a total, cash, a blank —
 * is skipped with its line number rather than guessed at.
 */
export function holdingsFromCsv(text: string): ImportResult {
  const table = parseCsv(text);
  const errors: ImportResult['errors'] = [];
  if (!table.length) return { rows: [], errors: [{ line: 0, message: 'The file is empty.' }], columns: null };

  const cols = findColumns(table[0]);
  const hasHeader = cols.symbol !== null && cols.shares !== null;
  const idx = hasHeader ? cols : { symbol: 0, shares: 1, price: 2 as number | null, total: null as number | null, date: 3 as number | null };
  const body = hasHeader ? table.slice(1) : table;
  const rows: ImportRow[] = [];
  body.forEach((cells, k) => {
    const line = k + (hasHeader ? 2 : 1);
    const symbol = cleanSymbol(cells[idx.symbol as number]);
    if (!symbol) return;
    if (!isSymbol(symbol)) { errors.push({ line, message: `“${cells[idx.symbol as number]}” is not a ticker — skipped.` }); return; }
    const shares = parseNumber(cells[idx.shares as number]);
    if (!finite(shares) || shares <= 0) { errors.push({ line, message: `${symbol}: no positive share count — skipped.` }); return; }
    let price = idx.price !== null ? parseNumber(cells[idx.price]) : null;
    if (!finite(price) && idx.total !== null) {
      const total = parseNumber(cells[idx.total]);
      price = finite(total) && total >= 0 ? total / shares : null;
    }
    if (finite(price) && price < 0) price = null;
    const rawDate = idx.date !== null ? cells[idx.date] : '';
    const date = parseDay(rawDate);
    if (rawDate && !date) errors.push({ line, message: `${symbol}: “${rawDate}” is not a date I can read — imported without one.` });
    rows.push({ line, symbol, shares, price: finite(price) ? price : null, date });
  });
  const name = (i: number | null) => (hasHeader && i !== null ? table[0][i] : undefined);
  return {
    rows,
    errors,
    columns: hasHeader ? { symbol: name(cols.symbol), shares: name(cols.shares), price: name(cols.price), total: name(cols.total), date: name(cols.date) } : null,
  };
}

/** Every lot as a CSV row, and a holding without lots as one row of its size. */
export function holdingsToRows(symbols: string[], holdings: Record<string, Holding>): (string | number | null)[][] {
  return symbols.flatMap((s) => {
    const h = holdings[s];
    if (h?.lots?.length) return h.lots.map((l) => [s, l.shares, l.price, l.date]);
    const shares = sharesHeld(h);
    return [[s, shares, null, null]];
  });
}
