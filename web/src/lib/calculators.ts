/* ==========================================================================
   Maz Vantage — the calculators

   Four pieces of arithmetic a reader otherwise does in a spreadsheet. None of
   them reads market data, and none of them is a forecast: every input is the
   reader's, and the result is what those inputs imply, compounded honestly.

   The conventions, because each one changes the answer and a calculator that
   hides them is the most common way these tools mislead:
   - Returns compound **monthly** from an annual rate: (1 + r)^(1/12) − 1, so
     a 7% year is 7%, not the 7.23% that compounding 7%/12 twelve times gives.
   - A fee comes off the return, not off the balance once a year:
     (1 + r)(1 − fee) − 1.
   - Dividends are paid **quarterly**, taxed when paid, and reinvested at that
     quarter's price — no fractional-share rounding, no trading cost.
   ========================================================================== */

const finite = (v: number) => Number.isFinite(v);

/* ---------- 1. investment growth ------------------------------------------- */

export interface GrowthInput {
  initial: number;
  monthly: number;
  /** annual return, as a fraction */
  rate: number;
  years: number;
  /** annual fee, as a fraction of the balance */
  fee?: number;
  /** contributions at the start of each month rather than the end */
  atStart?: boolean;
  /** the monthly contribution rises by this fraction each year */
  stepUp?: number;
}

export interface GrowthYear { year: number; contributed: number; value: number; growth: number }

export interface GrowthResult {
  rows: GrowthYear[];
  final: number;
  contributed: number;
  growth: number;
  /** what the fee cost over the period, against the same plan with none */
  feeCost: number;
  netRate: number;
}

export function investmentGrowth({ initial, monthly, rate, years, fee = 0, atStart = false, stepUp = 0 }: GrowthInput): GrowthResult {
  const n = Math.max(0, Math.min(100, Math.round(years)));
  const net = (1 + rate) * (1 - fee) - 1;
  const rm = net <= -1 ? -1 : (1 + net) ** (1 / 12) - 1;
  let value = initial;
  let contributed = initial;
  let pay = monthly;
  const rows: GrowthYear[] = [{ year: 0, contributed, value, growth: 0 }];
  for (let y = 1; y <= n; y += 1) {
    for (let m = 0; m < 12; m += 1) {
      if (atStart) value = (value + pay) * (1 + rm);
      else value = value * (1 + rm) + pay;
      contributed += pay;
    }
    rows.push({ year: y, contributed, value, growth: value - contributed });
    pay *= 1 + stepUp;
  }
  const last = rows.at(-1)!;
  return {
    rows,
    final: last.value,
    contributed: last.contributed,
    growth: last.growth,
    feeCost: fee > 0 ? investmentGrowth({ initial, monthly, rate, years, fee: 0, atStart, stepUp }).final - last.value : 0,
    netRate: net,
  };
}

/* ---------- 2. dividend reinvestment ----------------------------------------- */

export interface DripInput {
  amount: number;
  price: number;
  /** trailing dividend yield at the start, as a fraction */
  yieldPct: number;
  /** annual growth of the dividend per share */
  divGrowth: number;
  /** annual growth of the share price */
  priceGrowth: number;
  years: number;
  /** tax on dividends when paid, as a fraction */
  tax?: number;
}

export interface DripYear {
  year: number;
  /** reinvested */
  shares: number;
  value: number;
  income: number;
  /** taken in cash */
  cashValue: number;
  cashIncome: number;
  cashCollected: number;
}

export function dividendReinvestment({ amount, price, yieldPct, divGrowth, priceGrowth, years, tax = 0 }: DripInput) {
  const n = Math.max(0, Math.min(100, Math.round(years)));
  const startShares = price > 0 ? amount / price : 0;
  let px = price;
  let dps = price * yieldPct; // annual dividend per share
  let shares = startShares;
  let collected = 0;
  const pq = (1 + priceGrowth) ** 0.25;
  const rows: DripYear[] = [{ year: 0, shares, value: amount, income: 0, cashValue: amount, cashIncome: 0, cashCollected: 0 }];
  for (let y = 1; y <= n; y += 1) {
    let income = 0;
    let cashIncome = 0;
    for (let q = 0; q < 4; q += 1) {
      px *= pq;
      const perShare = (dps / 4) * (1 - tax);
      const paid = shares * perShare;
      income += paid;
      if (px > 0) shares += paid / px;
      const cash = startShares * perShare;
      cashIncome += cash;
      collected += cash;
    }
    rows.push({ year: y, shares, value: shares * px, income, cashValue: startShares * px + collected, cashIncome, cashCollected: collected });
    dps *= 1 + divGrowth;
  }
  const last = rows.at(-1)!;
  return {
    rows,
    reinvested: last.value,
    cash: last.cashValue,
    /** what reinvesting added over taking the dividends as cash */
    advantage: last.value - last.cashValue,
    /** the dividend the reinvested holding pays in its final year, after tax */
    finalIncome: last.income,
    /** that income as a yield on the money first put in */
    yieldOnCost: amount > 0 ? last.income / amount : null,
  };
}

/* ---------- 3. position size ------------------------------------------------- */

export interface PositionInput {
  account: number;
  /** the share of the account the reader will lose if the stop is hit */
  riskPct: number;
  entry: number;
  stop: number;
  target?: number | null;
}

export function positionSize({ account, riskPct, entry, stop, target = null }: PositionInput) {
  const errors: string[] = [];
  if (!(account > 0)) errors.push('The account size has to be above zero.');
  if (!(riskPct > 0 && riskPct < 1)) errors.push('The risk per trade has to be between 0% and 100%.');
  if (!(entry > 0)) errors.push('The entry price has to be above zero.');
  if (!(stop > 0)) errors.push('The stop price has to be above zero.');
  if (entry === stop) errors.push('The stop cannot be the entry price — there would be no risk to size against.');
  if (errors.length) return { ok: false as const, errors };

  const long = stop < entry;
  const perShare = Math.abs(entry - stop);
  const budget = account * riskPct;
  const shares = Math.floor(budget / perShare);
  const value = shares * entry;
  const atRisk = shares * perShare;
  let rewardRisk: number | null = null;
  let targetWarning: string | null = null;
  if (target != null && finite(target) && target > 0) {
    if (long ? target <= entry : target >= entry) targetWarning = `A ${long ? 'long' : 'short'} trade’s target has to be ${long ? 'above' : 'below'} the entry.`;
    else rewardRisk = Math.abs(target - entry) / perShare;
  }
  return {
    ok: true as const,
    errors: [] as string[],
    direction: long ? 'long' as const : 'short' as const,
    perShare,
    budget,
    shares,
    value,
    atRisk,
    accountShare: account > 0 ? value / account : null,
    /** the position costs more than the account holds */
    leveraged: value > account,
    stopDistance: perShare / entry,
    rewardRisk,
    targetWarning,
  };
}

/* ---------- 4. annualised return --------------------------------------------- */

export function annualisedReturn({ start, end, years, inflation = 0 }: { start: number; end: number; years: number; inflation?: number }) {
  if (!(start > 0) || !(end >= 0) || !(years > 0)) return null;
  const total = end / start - 1;
  const cagr = (end / start) ** (1 / years) - 1;
  const real = (1 + cagr) / (1 + inflation) - 1;
  return {
    total,
    cagr,
    real,
    /** exact, and the rule-of-72 shortcut it is usually confused with */
    doubling: cagr > 0 ? Math.log(2) / Math.log(1 + cagr) : null,
    rule72: cagr > 0 ? 72 / (cagr * 100) : null,
  };
}
