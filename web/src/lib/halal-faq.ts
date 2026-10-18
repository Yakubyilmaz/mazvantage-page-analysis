/* ==========================================================================
   Maz Vantage — the questions a reader asks about one company's halal status

   The Shariah tab's FAQ, as plain data so the page and its structured data
   print the same words. Screeners elsewhere answer these with the same
   paragraph on every company ("a halal stock can become non-compliant if its
   ratios change"); here every answer is that company's own figures:

   - **which standards it passes**, each with its ratios and limits;
   - **how close it is to the line** — the tightest test, and how far the
     market value (or the debt) would have to move to cross it — or, for a
     company that fails, **what it would take to pass**;
   - **what to purify**, from its own interest income and dividend.

   The rules the label keeps hold here too: a screen, never a ruling; a
   figure that was not measured is said to be missing, never filled in; and
   nothing is answered for a company the screen could not read.
   ========================================================================== */

import { isNum, money, pct } from './format';
import type { HalalLabel } from './halal-label';
import type { QuickInputs, QuickResult, QuickTest } from './shariah';
import { viewHref } from './routes';

export interface FaqItem {
  q: string;
  /** Paragraphs, in order. */
  a: string[];
  /** One line per standard, where the answer is a list. */
  list?: string[];
  link?: { href: string; label: string };
}

export interface FaqSubject {
  symbol: string;
  name: string;
  label: HalalLabel;
  /** The quick screen's five rows, or null when there was nothing to screen. */
  rows: QuickResult[] | null;
  inputs: QuickInputs | null;
  /** The balance sheet the screen read. */
  asOf: string | null;
}

const TEST_NAME: Record<QuickTest['key'], string> = {
  debt: 'debt',
  cash: 'cash and interest-bearing investments',
  ar: 'receivables',
  interest: 'interest income',
};

const testName = (r: QuickResult, t: QuickTest) => (t.key === 'ar' && r.std.ar?.withCash ? 'receivables and cash' : TEST_NAME[t.key]);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** What a test divides by, in words: "12-month market cap", "total assets", "revenue". */
const base = (r: QuickResult, t: QuickTest) => (t.key === 'interest' ? 'revenue' : lower(r.basis));
const measured = (r: QuickResult) => r.tests.filter((t) => isNum(t.value));
const ratio = (t: QuickTest) => (t.value as number) / t.limit;
const STATE: Record<QuickResult['state'], string> = { pass: 'passes', fail: 'fails', na: 'not measured' };

/** "A, B and C" */
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** "debt at 32% of 12-month market cap against a 30% limit" */
const against = (r: QuickResult, t: QuickTest) => `${testName(r, t)} at ${pct(t.value)} of ${base(r, t)} against a ${pct(t.limit)} limit`;

/** "debt 3.1% of 12-month market cap (limit 30%)" */
const reading = (r: QuickResult, t: QuickTest) => `${testName(r, t)} ${pct(t.value)} of ${base(r, t)} (limit ${pct(t.limit)})`;

/** "AAOIFI: passes — debt 3.1% of 12-month market cap (limit 30%), …" */
export function standardLine(r: QuickResult): string {
  const tests = measured(r);
  const detail = tests.length ? tests.map((t) => reading(r, t)).join('; ') : 'not enough of the balance sheet was available';
  return `${r.std.name}: ${STATE[r.state]} — ${detail}.`;
}

/**
 * How far a passing test is from its limit, in the move that would close the
 * gap: the market value falling (four standards divide by it), total assets
 * shrinking, or interest income growing.
 */
function marginLine(r: QuickResult, t: QuickTest): string {
  const v = t.value as number;
  const head = `The closest test is ${r.std.name}'s limit on ${testName(r, t)}: ${pct(v)} of ${base(r, t)}, against ${pct(t.limit)}.`;
  if (v <= 0) return `${head} It has none, so no move in the market value alone could fail it.`;
  if (t.key === 'interest') return `${head} Interest income would have to grow about ${pct(t.limit / v - 1, { dp: 0 })} with the same revenue to cross it.`;
  if (r.std.divisor === 'assets') return `${head} Its ${testName(r, t)} would have to grow about ${pct(t.limit / v - 1, { dp: 0 })} with the same total assets to cross it.`;
  return `${head} With the same ${testName(r, t)}, its ${base(r, t)} would have to fall about ${pct(1 - v / t.limit, { dp: 0 })} to cross it.`;
}

/** What one failing test would need: the numerator down, or the denominator up. */
function fixLine(r: QuickResult, t: QuickTest): string {
  const v = t.value as number;
  const down = pct(1 - t.limit / v, { dp: 0 });
  const up = pct(v / t.limit - 1, { dp: 0 });
  const head = `${r.std.name} measures its ${testName(r, t)} at ${pct(v)} of ${base(r, t)}, against a ${pct(t.limit)} limit.`;
  if (t.key === 'interest') return `${head} Interest income would need to fall about ${down} with the same revenue.`;
  return `${head} It would need its ${testName(r, t)} to fall about ${down}, or its ${base(r, t)} to rise about ${up}.`;
}

const OPENER: Record<HalalLabel['tone'], string> = {
  good: 'Yes.',
  warn: 'It depends on the standard you follow.',
  bad: 'No.',
  muted: 'It cannot be screened yet.',
};

export function halalFaq(s: FaqSubject): FaqItem[] {
  const { name, label, rows, inputs, asOf } = s;
  const researched = label.source === 'researched';
  const out: FaqItem[] = [];

  /* 1. The question itself, answered in its first word. */
  const opener = researched && label.tone === 'warn' ? 'Yes for now, but it is close to a limit.' : OPENER[label.tone];
  out.push({
    q: `Is ${name} (${s.symbol}) halal to invest in?`,
    a: [`${opener} ${label.sentence}`, ...(!researched && asOf ? [`Read from the balance sheet of ${asOf}.`] : [])],
  });
  if (label.tone === 'muted') return [...out, updated(s), ruling()];

  /* 2. Why: the activity, the researched finding, or each standard's ratios. */
  if (label.excluded) {
    out.push({
      q: `Why is ${name} not halal?`,
      a: [`Its line of business (${label.excluded}) is excluded under every published Shariah methodology, so its balance sheet is not tested: no ratio could make it compliant.`],
    });
  } else if (researched) {
    out.push({
      q: `What did the researched screen of ${name} find?`,
      a: [label.detail || label.sentence, `Methodology ${label.version}, screened ${label.screened}.`],
    });
  } else if (rows?.length) {
    out.push({
      q: `Which Shariah standards does ${name} pass?`,
      a: [`It passes ${label.passed} of ${label.total}. Each standard sets its own limits and divides by something different:`],
      list: rows.map(standardLine),
    });
  }

  /* 3. Why they disagree, when they do. */
  if (!researched && !label.excluded && rows && label.passed > 0 && label.failed > 0) {
    const failing = rows.filter((r) => r.state === 'fail');
    const passing = rows.filter((r) => r.state === 'pass');
    const why = failing.map((r) => {
      const worst = measured(r).filter((t) => t.state === 'fail').sort((x, y) => ratio(y) - ratio(x))[0];
      return worst ? `${r.std.name}, on ${against(r, worst)}` : r.std.name;
    });
    out.push({
      q: `Why do the standards disagree on ${name}?`,
      a: [
        `It fails under ${why.join('; and under ')}${passing.length ? `. It passes ${and(passing.map((r) => r.std.name))}` : ''}.`,
        'AAOIFI, S&P, Dow Jones and FTSE divide debt and cash by an average market value (12, 36, 24 and 24 months); MSCI divides by total assets. The limits differ too, from 30% to 33%. The same balance sheet can therefore pass one standard and fail another.',
      ],
      link: { href: viewHref('shariah', 'methodology'), label: 'How the five standards differ' },
    });
  }

  /* 4. How close to the line, or how far from it. */
  if (!researched && !label.excluded && rows) {
    if (label.failed === 0) {
      const tight = rows.filter((r) => r.state === 'pass')
        .flatMap((r) => measured(r).map((t) => ({ r, t })))
        .sort((x, y) => ratio(y.t) - ratio(x.t))[0];
      if (tight) {
        out.push({
          q: `How close is ${name} to losing its halal status?`,
          a: [
            marginLine(tight.r, tight.t),
            'Four of the five standards divide by market value, so a falling share price alone can make a halal company non-compliant, without any new filing.',
          ],
        });
      }
    } else {
      const nearest = rows.filter((r) => r.state === 'fail')
        .map((r) => ({ r, fails: measured(r).filter((t) => t.state === 'fail').sort((x, y) => ratio(y) - ratio(x)) }))
        .filter((x) => x.fails.length)
        .sort((x, y) => ratio(x.fails[0]) - ratio(y.fails[0]))[0];
      if (nearest) {
        const [worst, ...others] = nearest.fails;
        out.push({
          q: `What would it take for ${name} to pass?`,
          a: [
            `The nearest is ${nearest.r.std.name}. ${fixLine(nearest.r, worst)}`,
            ...(others.length ? [`It also fails on ${others.map((t) => reading(nearest.r, t)).join(' and ')}.`] : []),
          ],
        });
      }
    }
  }

  /* 5. Purification, for a company a reader may hold. */
  if (!label.excluded && label.tone !== 'bad' && inputs) {
    out.push(purification(name, inputs));
  }

  return [...out, updated(s), ruling()];
}

/**
 * The ratio method: purify the interest share of revenue out of each
 * dividend. Given as a share first, because it holds whatever the dividend
 * is; in money only when a dividend over the last year is on record (a
 * missing dividend history is not evidence of no dividend).
 */
function purification(name: string, inputs: QuickInputs): FaqItem {
  const q = `Do I need to purify dividends from ${name}?`;
  const link = { href: viewHref('shariah', 'purification'), label: 'How purification is worked out' };
  const share = isNum(inputs.interestIncome) && isNum(inputs.revenue) && inputs.revenue > 0 ? inputs.interestIncome / inputs.revenue : null;
  if (share == null) {
    return { q, a: ['Its latest annual income statement reports no interest income, so there is no interest share to purify on this measure. Income from excluded activities is not reported in the statements either, so it cannot be measured here.'], link };
  }
  const dps = inputs.dps ?? 0;
  const cash = (v: number) => money(v, { plain: true, dp: v < 0.01 ? 4 : 2 });
  return {
    q,
    a: [
      `Interest income was ${pct(share, { dp: 2 })} of revenue in its latest year. On the ratio method most screeners use, that is the share of each dividend to give to charity${dps > 0 ? `: about ${cash(dps * share)} of the ${cash(dps)} per share it paid over the last twelve months` : ''}.`,
      'That is a floor: income from excluded activities would add to it, and no statement reports it.',
    ],
    link,
  };
}

function updated(s: FaqSubject): FaqItem {
  const q = `How often is ${s.name}'s halal status checked?`;
  if (s.label.source === 'researched') {
    return { q, a: [`This is a researched screen of its filings: methodology ${s.label.version}, screened ${s.label.screened}. It reflects the filings as of that date.`] };
  }
  return {
    q,
    a: [`Every day. Four of the five standards divide by market value, so the ratios are recomputed from the latest market capitalisation daily. The balance sheet is the latest annual one${s.asOf ? ` (${s.asOf})` : ''}, replaced when the next annual report is filed.`],
  };
}

function ruling(): FaqItem {
  return {
    q: 'Is this a fatwa?',
    a: ['No. It is a mechanical screen of reported figures against five published methodologies: AAOIFI, S&P, Dow Jones, FTSE and MSCI. It cannot see income from excluded activities inside revenue, and scholars differ on the limits. For a ruling on your own situation, ask a qualified scholar.'],
    link: { href: viewHref('shariah', 'methodology'), label: 'The screening methodology' },
  };
}

/** The FAQ as schema.org structured data, word for word what the page prints. */
export function faqJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: [...it.a, ...(it.list || [])].join(' ') },
    })),
  };
}
