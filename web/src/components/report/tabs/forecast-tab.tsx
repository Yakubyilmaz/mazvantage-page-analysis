'use client';

/* ==========================================================================
   Maz Vantage — the Analysts Forecast tab

   What the sell side expects, and what the company did against what they
   expected last time. Everything here is somebody else's number, and none of
   it is graded — the one place the report forms a view on a forecast is the
   pair of hurdles in the first card, straight from the Momentum factor.

   - **A consensus is a mean of models, not a forecast.** The far year is a
     thinner sample than the near one; the table prints the analyst counts.
   - **Targets run optimistic across the board**, which is why the first card
     measures implied upside against the sector median rather than zero.
   ========================================================================== */

import * as React from 'react';
import { ago, cagr, curSymbol, dec, fmtDate, isNum, money, parseDate, pct, price, signClass } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { ColumnChart, ForecastChart } from '@/components/charts/charts';
import { DataTable, FeedGate, Limits, Notice, OCard, OHead, PerfPill, Pill, StatLine, StatLines, toneClass } from '@/components/report/ui';
import { GradeBar, OSub } from '@/components/report/grade-parts';
import { AnalystForecastPanel } from '@/components/report/factor-panels';
import { cn } from '@/lib/cn';
import type { GradeTone } from '@/lib/grading';

const gateOr = (a: Analysis, feed: string, what: string, missing: string) =>
  a.ds.status(feed) !== 'ok' ? <FeedGate a={a} feed={feed} what={what} /> : <Notice>{missing}</Notice>;

/** How far off a future date is — `ago()` measures backwards. */
function until(date: unknown) {
  const t = parseDate(date as string);
  if (!t) return '';
  const days = Math.round((t.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'date has passed';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 45) return `in ${days} days`;
  const months = Math.round(days / 30);
  return `in about ${months} month${months === 1 ? '' : 's'}`;
}

const analystNote = (r: any, perShare: boolean) => {
  const n = perShare ? r.analystsEps : r.analystsRevenue;
  return isNum(n) ? `${n} analyst${n === 1 ? '' : 's'}` : '';
};

const RATING_BUCKETS = [
  { key: 'strongBuy', label: 'Strong buy', tone: 'strong' },
  { key: 'buy', label: 'Buy', tone: 'good' },
  { key: 'hold', label: 'Hold', tone: 'mid' },
  { key: 'sell', label: 'Sell', tone: 'weak' },
  { key: 'strongSell', label: 'Strong sell', tone: 'poor' },
] as const;

/**
 * Filed history joined to the consensus path, with the estimate band. One
 * chart, one split line: the join is the whole question. Filed EPS is GAAP and
 * consensus is usually non-GAAP, so the step carries a definition change too.
 */
function OutlookCard({ a, id, title, series, low, high, perShare = false, info }: {
  a: Analysis; id: string; title: string; series: string; low: string; high: string; perShare?: boolean; info: string;
}) {
  const cur = curSymbol(a.facts.currency);
  const fmt = perShare ? (v: number) => price(v, cur) : (v: number) => money(v, { currency: cur });
  const filedField = perShare ? 'epsDiluted' : 'revenue';
  const filed = (a.facts.statements.income || []).filter((r: any) => isNum(r[filedField])).slice(-6)
    .map((r: any) => ({ year: String(new Date(r.date).getUTCFullYear()), value: r[filedField] as number }));
  const lastFiled = filed.length ? Number(filed[filed.length - 1].year) : null;
  const ahead = (a.forecast.rows || []).filter((r: any) => !isNum(lastFiled) || r.year > lastFiled);
  const points = [...filed.map((r: any) => r.year), ...ahead.map((r: any) => String(r.year))];
  const values = [...filed.map((r: any) => r.value), ...ahead.map((r: any) => r[series] ?? null)];
  const nulls = filed.map(() => null);

  if (points.length < 2 || !values.some(isNum)) {
    return <OCard span={12} id={`fx-${id}`}><OHead title={title} /><Notice>Not enough filed history and consensus to draw an outlook.</Notice></OCard>;
  }
  const first = ahead[0];
  const last = ahead[ahead.length - 1];
  const bandWidth = first && isNum(first[low]) && isNum(first[high]) && isNum(first[series]) && first[series] > 0
    ? (first[high] - first[low]) / first[series] : null;
  // The three rates the band implies, compounded from the last *filed* year —
  // the step the split line draws — not from the first consensus year.
  const base = filed.length ? filed[filed.length - 1].value : null;
  const span = last && isNum(lastFiled) ? last.year - lastFiled : 0;
  const rate = (v: unknown) => cagr(base, v as number, span);

  return (
    <OCard span={12} id={`fx-${id}`}>
      <OHead title={title} info={info} />
      <ForecastChart points={points} height={300} valueFmt={fmt} splitAt={Math.max(filed.length - 1, 0)} series={[{
        name: title, color: 'var(--primary)', values,
        low: [...nulls, ...ahead.map((r: any) => r[low] ?? null)],
        high: [...nulls, ...ahead.map((r: any) => r[high] ?? null)],
      }]} />
      {span > 0 && isNum(base) && last ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {([['High', last[high], 'up'], ['Consensus', last[series], 'mid'], ['Low', last[low], 'down']] as [string, unknown, 'up' | 'mid' | 'down'][]).map(([label, v, tone]) => (
            <PerfPill key={label} label={`${label} CAGR`} tone={tone} value={isNum(rate(v)) ? pct(rate(v), { sign: true }) : 'n/a'}
              title={`Compounded from filed ${lastFiled} to the ${last.year} estimate.`} />
          ))}
        </div>
      ) : null}
      <StatLines split>
        <StatLine label={first ? `Consensus, ${first.year}` : 'Consensus'} value={fmt(first?.[series])} note={first ? analystNote(first, perShare) : ''} />
        <StatLine label={last && last !== first ? `Consensus, ${last.year}` : 'Furthest estimate'} value={fmt(last?.[series])} note={last ? analystNote(last, perShare) : ''} />
        <StatLine label="Spread of estimates" value={isNum(bandWidth) ? pct(bandWidth) : 'n/a'} note={first ? `of the ${first.year} consensus` : ''}
          title="Highest estimate less lowest, over the mean. The wider it is, the less agreement sits behind the single line." />
      </StatLines>
    </OCard>
  );
}

export function ForecastTab({ a }: { a: Analysis }) {
  const fc = a.forecast || {};
  const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';
  if (!fc.available || !fc.rows?.length) {
    return (
      <div className={grid}>
        <OCard span={12} id="fx-none">
          <OHead title="Analyst forecasts" />
          {gateOr(a, 'estimates', 'Analyst estimates', 'No analyst estimates were returned for this company. Coverage is thin or absent for most companies outside the large caps.')}
        </OCard>
      </div>
    );
  }
  const cur = curSymbol(a.facts.currency);
  const m = a.momentum || {};
  const grades = a.ds.get('grades');

  // Surprises: the point is the calibration, not the beat. A company clearing
  // consensus by four per cent every quarter is guiding it down — the median
  // surprise matters more than the hit rate. Both are shown.
  const sp = a.surprises || { available: false, rows: [] };
  const srows = sp.rows.filter((r: any) => isNum(r.epsSurprise)).slice(-12);
  const svals: number[] = srows.map((r: any) => r.epsSurprise);
  const sorted = [...svals].sort((x, y) => x - y);
  const mid = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const beats = svals.filter((v) => v >= 0).length;
  const slast = srows[srows.length - 1];

  // The vendor's scorecard: fixed thresholds, not a sector — so it disagrees
  // with the Maz Vantage grade, and neither is the verdict.
  const r = a.ratings || { available: false, scores: [] };
  const scoreTone = (v: number): GradeTone => (v >= 4 ? 'strong' : v >= 3 ? 'mid' : v >= 2 ? 'weak' : 'poor');

  const q = a.quarter || {};
  const Beat = ({ label, actual, est, surprise, fmt }: { label: string; actual: unknown; est: unknown; surprise: unknown; fmt: (v: number) => string }) => (
    <div>
      <OSub className="mt-0">{label}</OSub>
      <div className="grid grid-cols-3 gap-3">
        <div><b className="block text-xl font-bold tnum">{isNum(actual) ? fmt(actual) : 'n/a'}</b><i className="text-micro not-italic text-muted-foreground">reported</i></div>
        <div><b className="block text-xl font-bold text-muted-foreground tnum">{isNum(est) ? fmt(est) : 'n/a'}</b><i className="text-micro not-italic text-muted-foreground">expected</i></div>
        <div>
          <b className={cn('block text-xl font-bold tnum', toneClass(signClass(surprise as number)))}>{isNum(surprise) ? pct(surprise, { sign: true }) : 'n/a'}</b>
          <i className="text-micro not-italic text-muted-foreground">{isNum(surprise) ? (surprise >= 0 ? 'beat' : 'missed') : 'surprise'}</i>
        </div>
      </div>
    </div>
  );

  return (
    <div className={grid}>
      {/* The Momentum factor's own panel, reused whole: two copies of that
          reasoning drifting apart would be worse than the import. */}
      <OCard span={8} id="fx-target">
        <OHead title="Price target" info="The mean of published targets, against two hurdles: the sector’s median implied upside, and this company’s own cost of equity." />
        <AnalystForecastPanel a={a} />
      </OCard>

      {/* A consensus word hides its own margin: the bars are shares of the total,
          so the shape of the disagreement is what is on screen. */}
      <OCard span={4} id="fx-consensus">
        {!grades || !isNum(m.analystTotal) || m.analystTotal <= 0 ? (
          <><OHead title="Analyst ratings" />{gateOr(a, 'grades', 'Analyst ratings', 'No ratings breakdown is available for this company.')}</>
        ) : (
          <>
            <OHead title="Analyst ratings" aside={<Pill tone="gold">{grades.consensus || 'n/a'}</Pill>}
              info="Every published rating on record, bucketed. The score beside it puts the mix on a 1–5 scale, so a wall of strong buys reads as 5." />
            <div className="grid gap-3">
              {RATING_BUCKETS.map((b) => {
                const n = isNum(grades[b.key]) ? grades[b.key] : 0;
                return (
                  <div key={b.key} className="grid grid-cols-[84px_minmax(0,1fr)_32px] items-center gap-3 text-13">
                    <span>{b.label}</span>
                    <GradeBar tone={b.tone} share={(n / m.analystTotal) * 100} className="mt-0" />
                    <span className="text-right text-muted-foreground tnum">{n ? String(n) : '—'}</span>
                  </div>
                );
              })}
            </div>
            <StatLines split>
              <StatLine label="Analysts rating" value={String(m.analystTotal)} />
              <StatLine label="Consensus score" value={isNum(m.analystScore) ? `${dec(m.analystScore, 2)} / 5` : 'n/a'}
                title="Strong buy counts 5, strong sell 1. The mean of every rating in the mix above." />
            </StatLines>
          </>
        )}
      </OCard>

      <OutlookCard a={a} id="revenue" title="Revenue outlook" series="revenue" low="revenueLow" high="revenueHigh"
        info="Filed revenue to the left of the split, consensus to the right. The band is the spread between the lowest and highest estimate for that year." />
      <OutlookCard a={a} id="eps" title="Earnings per share outlook" series="eps" low="epsLow" high="epsHigh" perShare
        info="Filed diluted EPS against consensus EPS. Consensus is usually a non-GAAP number and the filed figure is GAAP, so the step across the split is not purely a forecast." />

      <OCard span={8} id="fx-surprise">
        {srows.length < 2 ? (
          <><OHead title="Against consensus" />{gateOr(a, 'earnings', 'The earnings history', 'Not enough reported quarters with an estimate beside them to compare.')}</>
        ) : (
          <>
            <OHead title="Against consensus" info="Each reported quarter’s earnings per share over the estimate that stood before it. A quarter is labelled by the calendar quarter the results were announced in — the feed carries no fiscal period, and inferring one from a date is guesswork for any company whose year does not end in December." />
            {/* The surprise, not the EPS: two bars a hair apart on an absolute scale hide the gap. */}
            <ColumnChart height={260} legend={false} valueFmt={(v) => pct(v, { sign: true, dp: 1 })} categories={srows.map((x: any) => x.label)}
              series={[{ name: 'Surprise', color: 'var(--up)', colors: svals.map((v) => (v < 0 ? 'var(--down)' : 'var(--up)')), values: svals }]} />
            <StatLines split>
              <StatLine label="Beat the estimate" value={`${beats} of ${svals.length}`} note={pct(beats / svals.length, { dp: 0 })} tone={beats === svals.length ? 'pos' : ''} />
              <StatLine label="Median surprise" value={pct(mid, { sign: true })} tone={signClass(mid)}
                title="The middle quarter, not the average — one blowout does not move it. A company that beats by the same small margin every quarter is being guided to, not outperforming." />
              <StatLine label="Last quarter" value={isNum(slast.eps) ? `${cur}${dec(slast.eps, 2)}` : 'n/a'}
                note={isNum(slast.epsEstimate) ? `against ${cur}${dec(slast.epsEstimate, 2)} expected` : ''} />
            </StatLines>
          </>
        )}
      </OCard>

      <OCard span={4} id="fx-rating">
        {!r.available ? (
          <><OHead title="Reference rating" />{gateOr(a, 'ratings', 'The reference rating', 'No reference rating is available for this company.')}</>
        ) : (
          <>
            <OHead title="Reference rating" aside={r.rating ? <span className="rounded-full bg-foreground px-3 py-1 text-tiny font-semibold text-background">{r.rating}</span> : null}
              info="A published scorecard, one to five per test, scored against fixed thresholds rather than against a sector. It is not the Maz Vantage grade and the two will disagree — the Ratings tab is where this report answers for itself." />
            <div className="grid gap-3">
              {r.scores.map((sc: any) => (
                <div key={sc.label} title={sc.note || undefined} className="grid grid-cols-[minmax(0,1fr)_120px_20px] items-center gap-3 text-13">
                  <span className="truncate">{sc.label}</span>
                  <GradeBar tone={scoreTone(sc.value)} share={(sc.value / 5) * 100} className="mt-0" />
                  <b className="text-right tnum">{sc.value}</b>
                </div>
              ))}
            </div>
            <p className="mt-4 text-tiny text-muted-foreground/80">Each test is scored out of 5. Hover a row for what it is measuring.</p>
          </>
        )}
      </OCard>

      {/* The analyst counts are the reason this table exists: a far-year line
          from four models and a near one from thirty look identical on a chart. */}
      <OCard span={12} id="fx-estimates">
        <OHead title="Consensus estimates by year" info="As aggregated. The last column is how many analysts contributed a revenue estimate and how many an EPS estimate — the far years are usually a much thinner sample." />
        <DataTable
          headers={[{ label: 'Fiscal year' }, { label: 'Revenue', num: true }, { label: 'Revenue range', num: true }, { label: 'Net income', num: true },
            { label: 'EBITDA', num: true }, { label: 'EPS', num: true }, { label: 'EPS range', num: true }, { label: 'Analysts (rev / EPS)', num: true }]}
          rows={fc.rows.map((x: any) => {
            const mm = (v: unknown) => money(v as number, { currency: cur });
            return [
              <b key="y">{x.year}</b>, mm(x.revenue),
              isNum(x.revenueLow) && isNum(x.revenueHigh) ? `${mm(x.revenueLow)} – ${mm(x.revenueHigh)}` : 'n/a',
              mm(x.netIncome), mm(x.ebitda), isNum(x.eps) ? price(x.eps, cur) : 'n/a',
              isNum(x.epsLow) && isNum(x.epsHigh) ? `${price(x.epsLow, cur)} – ${price(x.epsHigh, cur)}` : 'n/a',
              isNum(x.analystsRevenue) || isNum(x.analystsEps) ? `${x.analystsRevenue ?? '—'} / ${x.analystsEps ?? '—'}` : 'n/a',
            ];
          })}
        />
        <p className="mt-4 text-tiny text-muted-foreground/80">
          Estimate years are fiscal, matching the company’s own year end rather than the calendar. Ranges are the lowest and highest
          individual estimate on record, not a confidence interval.
        </p>
      </OCard>

      <OCard span={12} id="fx-quarter">
        {!q.available ? (
          <><OHead title="Last reported quarter" />{gateOr(a, 'earnings', 'The earnings calendar', 'No reported quarter is available for this company.')}</>
        ) : (
          <>
            <OHead title={`Last reported quarter — ${fmtDate(q.date)}`} info="From the earnings calendar, the only quarterly figure in this dataset. A surprise is measured against the magnitude of the estimate, so beating a forecast loss counts as a beat." />
            <div className="grid gap-6 md:grid-cols-2">
              <Beat label="Earnings per share" actual={q.eps} est={q.epsEstimate} surprise={q.epsSurprise} fmt={(v) => price(v, cur)} />
              <Beat label="Revenue" actual={q.revenue} est={q.revenueEstimate} surprise={q.revenueSurprise} fmt={(v) => money(v, { currency: cur })} />
            </div>
            <StatLines split>
              <StatLine label="Reported" value={fmtDate(q.date)} note={ago(q.date)} />
              <StatLine label="Next expected report" value={q.next ? fmtDate(q.next) : 'not scheduled'} note={until(q.next)} />
            </StatLines>
          </>
        )}
      </OCard>

      <OCard span={12} id="fx-basis">
        <OHead title="About these forecasts" />
        <StatLines>
          <StatLine label="Estimate years" value={fc.rows.length ? `${fc.rows[0].year}–${fc.rows[fc.rows.length - 1].year}` : 'n/a'} />
          <StatLine label="Growth window" value={fc.base && fc.target ? `${fc.base.year}–${fc.target.year}` : 'n/a'} note="used for the headline growth rates" />
          <StatLine label="Analysts covering" value={isNum(fc.analystCount) ? String(fc.analystCount) : 'n/a'} note="most-covered estimate year" />
          <StatLine label="Implied upside" value={isNum(m.targetUpside) ? pct(m.targetUpside, { sign: true }) : 'n/a'} note="to consensus target" />
        </StatLines>
        <OSub>How to read them</OSub>
        <Limits items={[
          'Headline growth rates are the median year-on-year step across the window, not an endpoint-to-endpoint rate. Consensus paths often carry one bad year because a different subset of analysts covers each horizon, and a CAGR would inherit it whole.',
          'The estimate ranges are the lowest and highest individual model on record. They are a spread of opinion, not a probability interval.',
          'Consensus EPS is normally a non-GAAP figure. The filed EPS it is charted against is GAAP, so part of the step at the split line is a change of definition.',
          'Nothing on this tab is graded. The report scores the analyst view in one place only — the two hurdles at the top, which sit inside the Momentum factor.',
        ]} />
      </OCard>
    </div>
  );
}
