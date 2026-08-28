/* ==========================================================================
   Maz Vantage — factor sections

   One renderer drives all five factors. Each shows the 1-5 grade, then the
   metrics that produced it: the company's value, where it falls in the peer
   cohort, and a sentence saying what the number means. That decomposition is
   the whole point — a grade nobody can interrogate is just a number.
   ========================================================================== */

import { el, esc, isNum, money, pct, mult, trim, dec, signClass } from './util.js';
import { distributionStrip, gradeBar } from './charts.js';
import { ordinal } from './cohort.js';
import { FACTOR_META } from './metrics.js';

/* ---------- shared bits --------------------------------------------------- */

function gradeChip(grade, verdict) {
  return el('span', { class: `pill pill--${verdict.tone}` }, [
    isNum(grade) ? `${dec(grade, 2)} · ${verdict.label}` : 'Not rated',
  ]);
}

/** One metric: header line, grade bar, cohort strip, explanation. */
function metricRow(m, a) {
  const cohortLine = (() => {
    if (m.basis === 'cohort' && isNum(m.rank)) {
      return `Ranks ${ordinal(m.rank)} of ${m.total} in ${a.cohort.label}, against a peer median of ${m.fmt(m.median)}.`;
    }
    if (m.basis === 'band') {
      return 'Graded against published bands — no directly comparable peer figure exists for this one.';
    }
    return `Not enough peer data in ${a.cohort.label} to rank this metric.`;
  })();

  const trendLine = m.trend
    ? el('p', { class: 'metric__trend' }, [
        el('span', { class: `arrow arrow--${m.trend.direction}`,
          text: m.trend.direction === 'up' ? '▲' : m.trend.direction === 'down' ? '▼' : '▬' }),
        ` ${m.fmt(m.trend.value)} ${m.trend.label}`,
        isNum(m.trend.delta) ? el('span', {
          class: 'softer', text: ` · ${m.trend.delta > 0 ? '+' : ''}${m.fmt(m.trend.delta)} change`,
        }) : null,
      ])
    : null;

  const body = el('div', { class: 'metric__detail' }, [
    m.basis === 'cohort' && m.available ? distributionStrip(m, { fmt: m.fmt }) : null,
    el('p', { class: 'metric__cohort', text: cohortLine }),
    trendLine,
    m.note ? el('p', { class: 'metric__note', text: m.note }) : null,
  ]);

  const details = el('details', { class: 'metric' }, [
    el('summary', { class: 'metric__head' }, [
      el('span', { class: 'metric__label', text: m.label }),
      el('span', { class: 'metric__value', text: isNum(m.value) ? m.fmt(m.value) : 'n/a' }),
      el('span', { class: 'metric__bar' }, [gradeBar(m.grade)]),
      gradeChip(m.grade, m.verdict),
    ]),
    body,
  ]);
  return details;
}

/* ---------- the factor section -------------------------------------------- */

export function renderFactor(a, key) {
  const f = a.factors[key];
  const meta = FACTOR_META.find((x) => x.key === key);
  const weight = a.weights[key];

  const uncovered = f.total - f.graded;

  return el('section', { class: 'card sec', id: meta.anchor }, [
    el('div', { class: 'sec__intro' }, [
      el('div', { class: 'facthead' }, [
        el('div', {}, [
          el('h2', { text: f.label }),
          el('p', { text: meta.question }),
        ]),
        el('div', { class: 'facthead__grade' }, [
          el('div', { class: 'facthead__num', text: isNum(f.grade) ? dec(f.grade, 2) : '—' }),
          el('div', { class: 'facthead__scale', text: 'out of 5' }),
          gradeChip(f.grade, f.verdict),
        ]),
      ]),
      el('div', { class: 'mt2' }, [gradeBar(f.grade, { height: 10 })]),
      el('p', { class: 'facthead__meta' }, [
        `Graded against ${a.cohort.members.length} companies in ${a.cohort.label}`,
        el('span', { class: 'softer', text: ` · ${dec(weight * 100, 0)}% of the composite` }),
        uncovered ? el('span', { class: 'softer', text: ` · ${uncovered} metric${uncovered > 1 ? 's' : ''} not assessed` }) : null,
      ]),
    ]),

    el('div', { class: 'metrics' }, f.metrics.map((m) => metricRow(m, a))),
  ]);
}

/* ==========================================================================
   The scorecard that sits at the top of the report
   ========================================================================== */

export function renderScorecard(a, flakeNode) {
  const rows = FACTOR_META.map((meta) => {
    const f = a.factors[meta.key];
    return el('a', { class: 'score__row', href: `#${meta.anchor}` }, [
      el('span', { class: 'score__label', text: f.label }),
      el('span', { class: 'score__bar' }, [gradeBar(f.grade)]),
      el('span', { class: 'score__num', text: isNum(f.grade) ? dec(f.grade, 2) : '—' }),
      el('span', { class: `pill pill--${f.verdict.tone}`, text: f.verdict.label }),
    ]);
  });

  return el('section', { class: 'card sec', id: 'scorecard' }, [
    el('div', { class: 'card__head' }, [
      el('h2', { text: 'Maz Vantage Score' }),
      el('p', { text: a.verdict }),
    ]),
    el('div', { class: 'scorecard' }, [
      el('div', { class: 'scorecard__flake' }, [
        flakeNode,
        el('div', { class: 'scorecard__composite' }, [
          el('div', { class: 'scorecard__num', text: isNum(a.composite) ? dec(a.composite, 2) : '—' }),
          el('div', { class: `pill pill--${ratingTone(a.rating)}`, text: a.rating }),
        ]),
      ]),
      el('div', { class: 'scorecard__rows' }, rows),
    ]),
    el('p', { class: 't-tiny subtle mt2' }, [
      `Every grade is relative to ${a.cohort.members.length} size-matched companies in `
      + `${a.cohort.label}. The composite is a weighted average of the five factors, not a simple mean — `
      + 'weights are editable in Settings.',
    ]),
  ]);
}

function ratingTone(rating) {
  if (/strong buy/i.test(rating)) return 'good';
  if (/buy/i.test(rating)) return 'good';
  if (/hold/i.test(rating)) return 'neutral';
  return 'bad';
}

/* ==========================================================================
   Cohort section — who the company is being measured against
   ========================================================================== */

export function renderCohort(a) {
  const stats = a.cohortStats || {};
  const members = a.cohort.members;

  const rows = members.map((m) => {
    const s = stats[m.symbol] || {};
    return [
      el('a', { href: `?symbol=${encodeURIComponent(m.symbol)}`, class: 'bold', text: m.symbol }),
      m.name,
      money(m.marketCap),
      isNum(s.priceToEarningsRatioTTM) && s.priceToEarningsRatioTTM > 0 ? mult(s.priceToEarningsRatioTTM, 1) : '—',
      isNum(s.netProfitMarginTTM) ? pct(s.netProfitMarginTTM) : '—',
      isNum(s.returnOnInvestedCapitalTTM) ? pct(s.returnOnInvestedCapitalTTM) : '—',
      m.fromPeers ? el('span', { class: 'pill pill--muted', text: 'named peer' }) : '',
    ];
  });

  const self = a.facts;
  rows.unshift([
    el('span', { class: 'bold gold', text: self.symbol }),
    el('span', { class: 'bold', text: self.name }),
    money(self.marketCap),
    isNum(self.pe) && self.pe > 0 ? mult(self.pe, 1) : '—',
    isNum(self.netMargin) ? pct(self.netMargin) : '—',
    isNum(self.roic) ? pct(self.roic) : '—',
    el('span', { class: 'pill pill--gold', text: 'this company' }),
  ]);

  const headers = [{ label: 'Ticker' }, { label: 'Company' }, { label: 'Market cap', num: true },
                   { label: 'P/E', num: true }, { label: 'Net margin', num: true },
                   { label: 'ROIC', num: true }, { label: '' }];

  return el('section', { class: 'card sec', id: 'cohort' }, [
    el('div', { class: 'card__head' }, [
      el('h2', { text: 'Comparison Cohort' }),
      el('p', { text: cohortBlurb(a) }),
    ]),
    el('div', { class: 'tbl-wrap' }, [
      el('table', { class: 'tbl' }, [
        el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { class: h.num ? 'num' : '', text: h.label })))]),
        el('tbody', {}, rows.map((r, i) => el('tr', { class: i === 0 ? 'is-self' : '' },
          r.map((c, j) => el('td', { class: headers[j]?.num ? 'num' : '' }, [c instanceof Node ? c : String(c ?? '—')]))))),
      ]),
    ]),
    a.industryPe ? el('p', { class: 't-xs soft mt2' }, [
      el('b', { text: 'Live industry multiple: ' }),
      `${a.facts.industry} trades at ${mult(a.industryPe, 1)} earnings today`,
      isNum(a.facts.pe) && a.facts.pe > 0
        ? `, against ${a.facts.symbol} at ${mult(a.facts.pe, 1)}.` : '.',
    ]) : null,
  ]);
}

function cohortBlurb(a) {
  const n = a.cohort.members.length;
  const basis = a.cohort.basis;
  const how = basis === 'industry'
    ? `the ${a.facts.industry} industry`
    : basis === 'sector'
      ? `the ${a.facts.sector} sector, because the ${a.facts.industry} industry had too few listed companies to rank against`
      : 'the peer list published for this company';
  return `Every relative grade in this report is measured against these ${n} companies, drawn from ${how} `
    + 'and matched on size so the comparison is like for like.';
}
