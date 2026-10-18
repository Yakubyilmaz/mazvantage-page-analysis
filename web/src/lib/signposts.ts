/* ==========================================================================
   Maz Vantage — our record, and what would change the view

   Two things a reader should be able to hold the report to:

   - **the record**: each edition's fair value estimate and valuation zone,
     with the price then and the last close since. The record is short
     because the report is new; it is shown anyway, and it grows with every
     edition;
   - **signposts**: the specific, checkable thresholds at which a rating
     would move (the prices that change the valuation zone, the score that
     changes the quant verdict) and the evidence that would settle each key
     debate, with the next date it is tested. All of them are computed from
     the page's own figures, so they move with it.

   Nothing here enters a grade.
   ========================================================================== */

import { isNum } from './format';
import { VERDICT_BANDS } from './grading';
import type { Edition } from './research-editions';
import type { Implied } from './implied-expectations';
import type { Debate } from './debates';

export interface RecordRow { date: string; price: number | null; closeThen: number | null; closeThenDate: string | null; fairValue: number | null; zone: string | null; verdict: string | null; lastClose: number | null; lastDate: string | null; move: number | null }

export function trackRecord(editions: Edition[], closes: [string, number][] | null): RecordRow[] {
  const last = closes?.length ? closes[closes.length - 1] : null;
  // The close on the edition's date, or the last before it: the price the market was actually at, which can differ
  // from the price the edition used when the snapshot's quote was older than its prices.
  const on = (d: string) => (closes ? [...closes].reverse().find((c) => c[0] <= d) || null : null);
  return [...editions].sort((x, y) => x.date.localeCompare(y.date)).map((e) => ({
    date: e.date, price: e.price, closeThen: on(e.dataAsOf || e.date)?.[1] ?? null, closeThenDate: on(e.dataAsOf || e.date)?.[0] ?? null,
    fairValue: e.fairValue, zone: e.zone, verdict: e.quant.verdict,
    lastClose: last ? last[1] : null, lastDate: last ? last[0] : null,
    move: last && on(e.dataAsOf || e.date) ? last[1] / on(e.dataAsOf || e.date)![1] - 1 : null,
  }));
}

export type SignKind = 'zone' | 'quant' | 'growth' | 'margin' | 'debate' | 'earnings';

export interface Signpost {
  kind: SignKind;
  what: string;
  /** the threshold, in words */
  threshold: string;
  /** where it stands now */
  now: string;
  date: string | null;
}

export interface SignInputs {
  price: number | null;
  cur: string;
  zone: { label: string | null; low: number | null; high: number | null };
  quant: { score: number | null; verdict: string | null };
  implied: Implied | null;
  debates: Debate[];
  nextEarnings: string | null;
  fmt: { price: (v: number) => string; pct: (v: number) => string };
}

/** The score at which the quant verdict changes, up and down: whole numbers, as `verdictWord` bands them. */
export function verdictEdges(score: number) {
  const floor = Math.floor(score);
  const up = floor + 1 <= VERDICT_BANDS.length - 1 ? { at: floor + 1, word: VERDICT_BANDS[floor + 1] } : null;
  const down = floor - 1 >= 0 ? { at: floor, word: VERDICT_BANDS[floor - 1] } : null;
  return { up, down };
}

export function signposts(s: SignInputs): Signpost[] {
  const out: Signpost[] = [];
  const { price: P, pct } = s.fmt;
  if (s.zone.label && isNum(s.zone.low) && isNum(s.zone.high) && isNum(s.price)) {
    out.push({
      kind: 'zone', what: 'The valuation zone',
      threshold: `Undervalued below ${P(s.zone.low)}; overvalued above ${P(s.zone.high)}`,
      now: `${s.zone.label} at ${P(s.price)}`,
      date: null,
    });
  }
  if (isNum(s.quant.score)) {
    const e = verdictEdges(s.quant.score);
    const parts = [
      e.up ? `${e.up.word} at ${e.up.at.toFixed(2)} (${(e.up.at - s.quant.score).toFixed(2)} away)` : null,
      e.down ? `${e.down.word} below ${e.down.at.toFixed(2)} (${(s.quant.score - e.down.at).toFixed(2)} away)` : null,
    ].filter(Boolean);
    out.push({ kind: 'quant', what: 'The quant verdict', threshold: parts.join('; '), now: `${s.quant.verdict}, ${s.quant.score.toFixed(2)}`, date: null });
  }
  const im = s.implied;
  if (im && isNum(im.growth) && isNum(im.consensusGrowth)) {
    out.push({
      kind: 'growth', what: 'The consensus growth path',
      threshold: `The price is fair on the consensus only if the analysts’ ten-year path reaches ${pct(im.growth)} a year`,
      now: `${pct(im.consensusGrowth)} a year; watch the revisions in Street View`,
      date: null,
    });
  }
  if (im && isNum(im.margin) && isNum(im.filedMargins.peak)) {
    out.push({
      kind: 'margin', what: 'The operating margin',
      threshold: `${pct(im.margin)} on the consensus revenue path makes the price fair`,
      now: `${pct(im.filedMargins.latest ?? im.filedMargins.peak)} filed; peak ${pct(im.filedMargins.peak)} in FY${im.filedMargins.peakYear}`,
      date: null,
    });
  }
  for (const d of s.debates) {
    out.push({ kind: 'debate', what: d.question, threshold: d.settle, now: d.next.what, date: d.next.date === 'next' ? s.nextEarnings : d.next.date });
  }
  return out;
}

/** The paragraphs: how far each rating is from moving, in plain words. */
export function signpostProse(name: string, s: SignInputs): string[] {
  const out: string[] = [];
  const { price: P, pct } = s.fmt;
  const bits: string[] = [];
  if (isNum(s.quant.score)) {
    const e = verdictEdges(s.quant.score);
    const near = [e.up && e.up.at - s.quant.score <= 0.1 ? `${(e.up.at - s.quant.score).toFixed(2)} short of ${e.up.word}` : null,
      e.down && s.quant.score - e.down.at <= 0.1 ? `${(s.quant.score - e.down.at).toFixed(2)} above the line to ${e.down.word}` : null].filter(Boolean);
    bits.push(near.length
      ? `The quant rating is close to moving: ${s.quant.score.toFixed(2)} is ${near.join(' and ')}, so a small change in the ranked ratios, a quarter’s results or a price move against the sector, would change the verdict.`
      : `The quant rating, ${s.quant.verdict} at ${s.quant.score.toFixed(2)}, is not near an edge: it would take a broad change in the ratios to move it.`);
  }
  if (s.zone.label && isNum(s.zone.low) && isNum(s.zone.high) && isNum(s.price)) {
    const toHigh = s.zone.high / s.price - 1;
    const toLow = s.zone.low / s.price - 1;
    bits.push(s.zone.label === 'Overvalued'
      ? `The shares read overvalued at ${P(s.price)}; a fall of ${pct(-toHigh)} to ${P(s.zone.high)} would make them fairly valued, and of ${pct(-toLow)} to ${P(s.zone.low)} undervalued, unless the estimate moves first.`
      : s.zone.label === 'Undervalued'
        ? `The shares read undervalued at ${P(s.price)}; a rise of ${pct(toLow)} to ${P(s.zone.low)} would take them to fairly valued.`
        : `The shares read fairly valued at ${P(s.price)}: they would read overvalued above ${P(s.zone.high)} (${pct(toHigh, )} away) and undervalued below ${P(s.zone.low)}.`);
  }
  if (bits.length) out.push(bits.join(' '));
  const im = s.implied;
  if (im && isNum(im.growth) && isNum(im.consensusGrowth)) {
    out.push(
      `What would change our view of the value, rather than the rating, is the growth path. Our estimate follows the consensus; if the analysts’ ten-year path rose from ${pct(im.consensusGrowth)} toward the ${pct(im.growth)} the price implies, the estimate would follow it up and the gap to the price would close from our side. `
      + `The Street View section records whether their estimates are moving that way, and the Key Debates set out the evidence that would move them. ${name}’s next results are the first test.`,
    );
  }
  return out;
}
