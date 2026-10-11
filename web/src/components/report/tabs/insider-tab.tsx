'use client';

/* ==========================================================================
   Maz Vantage — the Insider Trading tab

   Two records the company's own people and the sell side leave behind:

   1. **Form 4s, charted and listed.** Money in above the line, money out
      below it, the share price behind both — then every filing with its
      name, role, code, size, price and a link to the document on sec.gov.
   2. **Rating actions by firm.** Each upgrade, downgrade and restated call,
      dated, in the firm's own words.

   Nothing on this tab is graded. The Ownership section of the Analysis tab
   keeps its four-quarter summary; this is the record behind it.

   Both feeds are fetched when the tab opens — one request each — and fall
   back to the bundled capture, the rule every on-demand feed follows.
   ========================================================================== */

import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink } from 'lucide-react';
import { fetchFor, loadSnapshot, INSIDER_HISTORY_CAP, type FeedResult } from '@/lib/fmp';
import { curSymbol, fmtDate, isNum, money, num, price, trim } from '@/lib/format';
import { normalisePrices, type Analysis } from '@/lib/model';
import {
  ACTION_LABEL, TX_CATEGORIES, TX_CODES, actionCounts, addMonths, isoBefore, latestByFirm, monthOf, monthlyFlows,
  normaliseInsiderTrades, normaliseRatingActions, ratingSide, summariseInsiders,
  type InsiderTx, type RatingAction, type RatingChange, type TxCategory,
} from '@/lib/insider-trading';
import { useDataEpoch } from '@/components/providers';
import { CsvButton } from '@/components/csv-button';
import { ChipRail } from '@/components/pages/page-parts';
import { FlowChart, type FlowSeries } from '@/components/charts/flow-chart';
import { DataTable, FeedGate, Notice, OCard, OGrid, OHead, Pill, StatLine, StatLines } from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const PAGE = 25;
const RATING_PAGE = 12;

/* ---------- loading -------------------------------------------------------- */

type TabLoad = { result: FeedResult; cap: number | null } | null;

/**
 * One on-demand feed: live, then the bundled capture, then whatever the
 * report already holds. A capture is cut at its own date, so it carries no
 * cap — its first row is where the record starts, not where a limit bit.
 */
function useTabFeed(name: 'insiderHistory' | 'gradeActions', symbol: string, cap: number | null,
  fallback: (() => TabLoad) | null = null): TabLoad {
  const { epoch } = useDataEpoch();
  const [state, setState] = React.useState<TabLoad>(null);
  const fb = React.useRef(fallback);
  fb.current = fallback;
  React.useEffect(() => {
    let live = true;
    setState(null);
    (async () => {
      const r = await fetchFor(name, symbol)
        .catch((): FeedResult => ({ status: 'error', data: null, message: 'the connection failed' }));
      let out: TabLoad = { result: r, cap };
      if (r.status !== 'ok') {
        const snap = await loadSnapshot(symbol).catch(() => null);
        const saved = snap?.feeds?.[name];
        if (Array.isArray(saved)) out = { result: { status: 'ok', data: saved, fromSnapshot: true, date: snap?.capturedAt }, cap: null };
        else out = fb.current?.() ?? out;
      }
      if (live) setState(out);
    })();
    return () => { live = false; };
  }, [name, symbol, cap, epoch]);
  return state;
}

/** "Today" for a window: the capture date on a saved copy, or a 90-day count would empty as the file ages. */
const nowOf = (r: FeedResult) => (r.fromSnapshot && r.date ? Date.parse(r.date) : Date.now());

const gateShim = (r: FeedResult) => ({ ds: { status: () => r.status, message: () => r.message || '' } });

const savedPill = (r: FeedResult) => (r.fromSnapshot
  ? <Pill tone="muted" title="Live data is unavailable, so this is a saved copy">{r.date ? `saved ${fmtDate(r.date)}` : 'saved copy'}</Pill>
  : null);

/** An axis label: "US$150m", never "US$150.0m" — the shared formatter keeps a decimal in the hundreds for tables. */
function compact(v: number, unit: string): string {
  for (const [scale, suffix] of [[1e12, 't'], [1e9, 'b'], [1e6, 'm'], [1e3, 'k']] as const) {
    if (Math.abs(v) >= scale) return `${unit}${trim(v / scale, 1)}${suffix}`;
  }
  return `${unit}${trim(v, 0)}`;
}

const monthLabel = (m: string) => fmtDate(`${m}-01`, { month: 'short', year: '2-digit' });
const monthLong = (m: string) => fmtDate(`${m}-01`, { month: 'long', year: 'numeric' });

/* ---------- small controls ------------------------------------------------- */

function Seg<T extends string>({ items, value, onChange, label }: {
  items: { id: T; label: string; disabled?: boolean; title?: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((it) => (
        <button key={it.id} type="button" aria-pressed={value === it.id} disabled={it.disabled} title={it.title}
          onClick={() => onChange(it.id)}
          className={cn('rounded-md px-2.5 py-1 text-tiny font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
            value === it.id && 'bg-background text-foreground shadow-sm')}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function DocLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-primary hover:underline">
      {children}<ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}

function LoadingCard({ id, title, what }: { id: string; title: string; what: string }) {
  return (
    <OCard span={12} id={id}>
      <OHead title={title} />
      <p className="text-13 text-muted-foreground">Loading {what}…</p>
    </OCard>
  );
}

/* ==========================================================================
   1. The chart and its summary
   ========================================================================== */

const RANGES = [
  { id: '1Y', months: 12 }, { id: '2Y', months: 24 }, { id: '3Y', months: 36 }, { id: '5Y', months: 60 },
] as const;
type RangeId = (typeof RANGES)[number]['id'];
type Scope = 'open' | 'all';
type Measure = 'value' | 'shares';

/** The range on screen: never earlier than the first full month on record. */
function chartWindow(rows: InsiderTx[], result: FeedResult, cap: number | null, range: RangeId) {
  const end = monthOf(isoBefore(nowOf(result), 0));
  const asked = addMonths(end, -(RANGES.find((r) => r.id === range)!.months - 1));
  const oldest = rows.length ? monthOf(rows[rows.length - 1].date) : end;
  // A capped list stops part-way through its oldest month, and a part-month
  // would chart as a quiet one. So the chart starts at the month after it.
  const capped = cap != null && Array.isArray(result.data) && result.data.length >= cap;
  const firstFull = capped ? addMonths(oldest, 1) : oldest;
  const start = asked < firstFull ? firstFull : asked;
  return { start, end, asked, capped, oldest, clipped: start > asked };
}

function FlowCard({ a, rows, result, cap, range, setRange }: {
  a: Analysis; rows: InsiderTx[]; result: FeedResult; cap: number | null; range: RangeId; setRange: (r: RangeId) => void;
}) {
  const cur = curSymbol(a.facts.currency);
  const [scope, setScope] = React.useState<Scope>('open');
  const [measure, setMeasure] = React.useState<Measure>('value');
  // Awards and exercises are filed at a price of zero: in shares they are
  // real, in money they would chart as nothing.
  const m: Measure = scope === 'all' ? 'shares' : measure;

  const w = chartWindow(rows, result, cap, range);
  const flows = React.useMemo(() => monthlyFlows(rows, w.start, w.end), [rows, w.start, w.end]);
  const months = flows.map((f) => f.month);

  // Month-end closes behind the bars, from the report's own price history.
  const closes = React.useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const p of normalisePrices(a.ds.get('prices'))) byMonth.set(monthOf(p.date), p.price);
    return byMonth;
  }, [a]);
  const line = {
    name: 'Share price (month end)',
    color: 'var(--chart-1)',
    values: months.map((mo) => closes.get(mo) ?? null),
    fmt: (v: number) => (Math.abs(v) >= 100 ? `${cur}${v.toFixed(0)}` : price(v, cur)),
  };
  const hasLine = line.values.some(isNum);

  const series: FlowSeries[] = scope === 'open'
    ? [
      { key: 'buy', name: 'Open-market purchases', color: 'var(--up)', sign: 1, values: flows.map((f) => (m === 'value' ? f.buyValue : f.buyShares)) },
      { key: 'sell', name: 'Open-market sales', color: 'var(--down)', sign: -1, values: flows.map((f) => (m === 'value' ? f.sellValue : f.sellShares)) },
    ]
    : [
      { key: 'buy', name: 'Purchases', color: 'var(--up)', sign: 1, values: flows.map((f) => f.buyShares) },
      { key: 'in', name: 'Awards & vesting', color: 'var(--up)', sign: 1, muted: true, values: flows.map((f) => f.otherInShares) },
      { key: 'sell', name: 'Sales', color: 'var(--down)', sign: -1, values: flows.map((f) => f.sellShares) },
      { key: 'out', name: 'Tax withholding, gifts & other', color: 'var(--down)', sign: -1, muted: true, values: flows.map((f) => f.otherOutShares) },
    ];
  const valueFmt = m === 'value' ? (v: number) => money(v, { currency: cur, dp: 1 }) : (v: number) => `${num(v, 1)} shares`;
  const axisFmt = (v: number) => compact(v, m === 'value' ? cur : '');
  const nothing = series.every((s) => s.values.every((v) => !v));

  const tipExtra = (i: number) => {
    const f = flows[i];
    if (!f.buys && !f.sells) return null;
    const bits = [f.buys ? `${f.buys} purchase${f.buys === 1 ? '' : 's'}` : '', f.sells ? `${f.sells} sale${f.sells === 1 ? '' : 's'}` : ''].filter(Boolean);
    return bits.join(' · ');
  };

  return (
    <OCard span={8} id="insider-chart">
      <OHead title="Insider buying and selling" className="flex-wrap"
        info="Each column is a calendar month of Form 4 filings by directors, officers and 10% holders, placed on the trade date. Above the line is stock acquired, below it stock disposed of. The line is the share price at each month end, on its own scale at the right."
        aside={savedPill(result)} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Seg label="Range" value={range} onChange={setRange} items={RANGES.map((r) => ({ id: r.id, label: r.id }))} />
        <Seg label="Which transactions" value={scope} onChange={setScope} items={[
          { id: 'open', label: 'Open-market trades', title: 'Purchases and sales only — codes P and S, an insider choosing to trade.' },
          { id: 'all', label: 'Every transaction', title: 'Awards, vesting, tax withholding and gifts as well, in shares.' },
        ]} />
        <Seg label="Measure" value={m} onChange={setMeasure} items={[
          { id: 'value', label: 'Value', disabled: scope === 'all', title: scope === 'all' ? 'Awards and vesting are filed at a price of zero, so every transaction can only be counted in shares.' : 'Shares times the price on the filing.' },
          { id: 'shares', label: 'Shares' },
        ]} />
      </div>
      {nothing && !hasLine ? (
        <Notice>No {scope === 'open' ? 'open-market trades' : 'transactions'} were filed from {monthLong(w.start)} to {monthLong(w.end)}.</Notice>
      ) : (
        <FlowChart categories={months} series={series} line={hasLine ? line : null} height={320} valueFmt={valueFmt} axisFmt={axisFmt}
          labelFmt={monthLabel} tipExtra={tipExtra} empty="No filings in this range" />
      )}
      {nothing && hasLine ? (
        <p className="mt-2 text-13 text-muted-foreground">
          No {scope === 'open' ? 'open-market purchases or sales' : 'transactions'} were filed in this range — only the price is drawn.
        </p>
      ) : null}
      <p className="mt-4 text-tiny leading-relaxed text-muted-foreground/80">
        {scope === 'open'
          ? 'Only codes P and S are counted — somebody choosing to buy or sell. Awards, vesting and the shares withheld to pay tax on them are under “Every transaction”. '
          : 'Lighter columns are the transactions nobody chose to trade: awards and vesting above the line, tax withholding, gifts and returns below it. '}
        Units and options are left out: a vesting files twice, once as units going out and once as shares coming in, and charting both would draw every vesting as a buy and a sale.
        {w.clipped ? ` Filings on record start in ${monthLong(w.capped ? w.start : w.oldest)}, so the chart is shorter than ${range}.` : ''}
        {w.capped ? ` The list holds the latest ${cap} filings, which reach back to ${monthLong(w.oldest)}; the chart starts at the first full month.` : ''}
      </p>
    </OCard>
  );
}

function SummaryCard({ a, rows, result, cap, range }: { a: Analysis; rows: InsiderTx[]; result: FeedResult; cap: number | null; range: RangeId }) {
  const cur = curSymbol(a.facts.currency);
  const w = chartWindow(rows, result, cap, range);
  const s = React.useMemo(() => summariseInsiders(rows, `${w.start}-01`), [rows, w.start]);
  const mm = (v: number) => money(v, { currency: cur });
  const side = (x: { trades: number; insiders: number }) => (x.trades
    ? `${x.trades} trade${x.trades === 1 ? '' : 's'} by ${x.insiders} insider${x.insiders === 1 ? '' : 's'}`
    : 'none filed');

  return (
    <OCard span={4} id="insider-summary">
      <OHead title={`Since ${monthLong(w.start)}`}
        info="The chart's range, counted in the stock itself — units and options are left out. Value is shares times the price on the filing." />
      <StatLines>
        <StatLine label="Open-market purchases" value={s.buys.trades ? mm(s.buys.value) : '—'} note={side(s.buys)} tone={s.buys.trades ? 'pos' : ''} />
        <StatLine label="Open-market sales" value={s.sells.trades ? mm(s.sells.value) : '—'} note={side(s.sells)} tone={s.sells.trades ? 'neg' : ''} />
        <StatLine label="Net bought or sold" value={s.buys.trades || s.sells.trades ? `${s.net > 0 ? '+' : ''}${mm(s.net)}` : '—'}
          tone={s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : ''} />
        <StatLine label="Shares withheld for tax" value={s.withheld ? num(s.withheld, 1) : '—'} note="on vesting and exercises"
          title="Code F: shares handed back to the company to pay the tax on a vesting. The insider did not choose to sell them." />
        <StatLine label="Shares awarded or vested" value={s.awarded ? num(s.awarded, 1) : '—'} note="awards and conversions" />
        <StatLine label="People filing" value={String(s.filers)} note="anything at all" />
      </StatLines>
      <OSub info="Ranked by money bought plus money sold on the open market in this range.">Largest open-market traders</OSub>
      {s.top.length ? (
        <ul className="grid gap-2.5">
          {s.top.map((p) => (
            <li key={p.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-13">
              <span className="min-w-0">
                <b className="block truncate font-semibold">{p.name}</b>
                <span className="block truncate text-micro text-muted-foreground">{p.role || 'Insider'} · last {fmtDate(p.last)}</span>
              </span>
              <span className="text-right tnum">
                {p.sold ? <span className="block text-down">−{mm(p.sold)}</span> : null}
                {p.bought ? <span className="block text-up">+{mm(p.bought)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-13 text-muted-foreground">No open-market trades in this range.</p>}
    </OCard>
  );
}

/* ==========================================================================
   2. Every filing
   ========================================================================== */

const TX_TONE: Record<TxCategory, string> = {
  buy: 'good', sell: 'bad', tax: 'warn', award: 'gold', exercise: 'gold', gift: 'muted', other: 'muted', holding: 'muted',
};

function TransactionsCard({ a, rows, result }: { a: Analysis; rows: InsiderTx[]; result: FeedResult }) {
  const symbol = a.facts.symbol;
  const cur = curSymbol(a.facts.currency);
  const [cat, setCat] = React.useState<TxCategory | 'all'>('all');
  const [who, setWho] = React.useState<string>('all');
  const [units, setUnits] = React.useState(false);
  const [shown, setShown] = React.useState(PAGE);

  const unitRows = rows.filter((r) => r.derivative).length;
  const base = units ? rows : rows.filter((r) => !r.derivative);
  const people = React.useMemo(() => [...new Set(rows.map((r) => r.name))].sort((x, y) => x.localeCompare(y)), [rows]);
  const mine = who === 'all' ? base : base.filter((r) => r.name === who);
  const counts = new Map<TxCategory, number>();
  for (const r of mine) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const list = cat === 'all' ? mine : mine.filter((r) => r.category === cat);
  const left = list.length - Math.min(shown, list.length);

  const chips = [
    { id: 'all' as const, label: 'All', tag: String(mine.length) },
    ...TX_CATEGORIES.filter((c) => counts.get(c.id)).map((c) => ({ id: c.id, label: c.label, tag: String(counts.get(c.id)) })),
  ];
  const blurb = cat === 'all' ? null : TX_CATEGORIES.find((c) => c.id === cat)?.blurb;
  const reset = () => setShown(PAGE);

  const signed = (r: InsiderTx) => {
    if (!isNum(r.shares) || (r.category === 'holding' && !r.shares)) return <span className="text-muted-foreground">—</span>;
    const n = r.shares.toLocaleString('en-US');
    if (r.direction === 'A') return <span className="text-up">+{n}</span>;
    if (r.direction === 'D') return <span className="text-down">−{n}</span>;
    return n;
  };

  return (
    <OCard span={12} id="insider-list">
      <OHead title="Insider transactions" className="flex-wrap"
        info="Every Form 3 and Form 4 row on record, newest trade first. Shares are signed: + acquired, − disposed of. Value is shares times the price on the filing; awards and exercises are filed at a price of zero and have none."
        aside={(
          <div className="flex items-center gap-2">
            {savedPill(result)}
            <CsvButton name={`${symbol} insider transactions${who === 'all' ? '' : ` ${who}`}${cat === 'all' ? '' : ` ${cat}`}`}
              build={() => ({
                headers: ['Trade date', 'Filed', 'Insider', 'Role', 'Code', 'Transaction', 'Security', 'Acquired or disposed',
                  'Shares', 'Price', 'Value', 'Owned after', 'Ownership', 'Form', 'Filing'],
                rows: list.map((r) => [r.date, r.filed, r.name, r.role, r.code, r.label, r.security,
                  r.direction === 'A' ? 'Acquired' : r.direction === 'D' ? 'Disposed' : '', r.shares, r.price, r.value, r.owned,
                  r.indirect ? 'Indirect' : 'Direct', r.form, r.url]),
              })} />
          </div>
        )} />
      <ChipRail label="Transaction type" items={chips} active={cat} onChoose={(c) => { setCat(c); reset(); }} />
      {blurb ? <p className="mt-3 text-13 leading-relaxed text-muted-foreground">{blurb}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-13">
        <label className="inline-flex items-center gap-2">
          <span className="text-muted-foreground">Insider</span>
          <select value={who} onChange={(e) => { setWho(e.target.value); setCat('all'); reset(); }}
            className="h-8 max-w-[260px] rounded-md border border-border bg-background px-2 text-13">
            <option value="all">Everyone ({people.length})</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {unitRows ? (
          <label className="inline-flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={units} onChange={(e) => { setUnits(e.target.checked); reset(); }} className="size-3.5 accent-[var(--primary)]" />
            Show stock units and options ({unitRows} rows)
          </label>
        ) : null}
      </div>

      {list.length ? (
        <>
          <DataTable className="mt-4" dense exportName={null}
            headers={[{ label: 'Date' }, { label: 'Insider' }, { label: 'Transaction' }, { label: 'Shares', num: true },
              { label: 'Value · price', num: true }, { label: 'Owned after', num: true }, { label: 'Filing' }]}
            rows={list.slice(0, shown).map((r) => [
              <span key="d" className="whitespace-nowrap">
                {fmtDate(r.date)}
                {r.filed && r.filed !== r.date ? <span className="block text-micro text-muted-foreground">filed {fmtDate(r.filed)}</span> : null}
              </span>,
              <span key="n" className="block min-w-[128px]">
                <b className="font-semibold">{r.name}</b>
                {r.role ? <span className="block text-micro text-muted-foreground">{r.role}</span> : null}
              </span>,
              <span key="t" className="block">
                <Pill tone={TX_TONE[r.category]} title={TX_CODES[r.code]?.meaning}>{r.label}{r.code ? ` · ${r.code}` : ''}</Pill>
                {r.derivative || r.indirect ? (
                  <span className="mt-1 block text-micro text-muted-foreground">
                    {[r.derivative ? r.security : '', r.indirect ? 'held indirectly' : ''].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </span>,
              signed(r),
              r.value != null ? (
                <span key="v" className="whitespace-nowrap">
                  {money(r.value, { currency: cur })}
                  <span className="block text-micro text-muted-foreground">at {price(r.price, cur)}</span>
                </span>
              ) : <span className="text-muted-foreground">—</span>,
              isNum(r.owned) ? r.owned.toLocaleString('en-US') : <span className="text-muted-foreground">—</span>,
              <DocLink key="l" href={r.url}>Form {r.form || '4'}</DocLink>,
            ])} />
          {left > 0 ? (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(left, PAGE)} more — {left} left
            </Button>
          ) : null}
        </>
      ) : <Notice className="mt-4">No filings of this kind{who === 'all' ? '' : ` by ${who}`}.</Notice>}

      <p className="mt-4 text-tiny leading-relaxed text-muted-foreground/80">
        Names are as filed with the SEC, surname first. The code after each transaction is the SEC’s — hover it for what it means.
        “Owned after” is the insider’s holding of that security after the transaction, as the filing reports it.
        {unitRows && !units ? ` ${unitRows} rows in stock units and options are hidden: each mirrors a row in the stock itself.` : ''}
        {' '}Links open the filing on sec.gov.
      </p>
    </OCard>
  );
}

/* ==========================================================================
   3. Rating actions by firm
   ========================================================================== */

const ACTION_TONE: Record<RatingAction, string> = {
  upgrade: 'text-up', downgrade: 'text-down', initiate: 'text-primary', maintain: 'text-foreground',
};

const SIDE_PILL: Record<string, { tone: string; label: string }> = {
  buy: { tone: 'good', label: 'Buy side' },
  hold: { tone: 'neutral', label: 'Hold' },
  sell: { tone: 'bad', label: 'Sell side' },
};

function ActionWord({ action }: { action: RatingAction }) {
  const Icon = action === 'upgrade' ? ArrowUpRight : action === 'downgrade' ? ArrowDownRight : null;
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium', ACTION_TONE[action])}>
      {ACTION_LABEL[action]}
      {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
    </span>
  );
}

const callText = (r: RatingChange) => (r.action === 'initiate' || !r.from
  ? <>{r.firm}: <b className="font-semibold">{r.to || 'rating not stated'}</b></>
  : <>{r.firm}: {r.from} to <b className="font-semibold">{r.to || 'not stated'}</b></>);

function RatingsCard({ symbol, rows, result }: { symbol: string; rows: RatingChange[]; result: FeedResult }) {
  const [view, setView] = React.useState<'timeline' | 'firms'>('timeline');
  const [act, setAct] = React.useState<RatingAction | 'all'>('all');
  const [shown, setShown] = React.useState(RATING_PAGE);
  const yearAgo = isoBefore(nowOf(result), 365);
  const firms = React.useMemo(() => latestByFirm(rows, yearAgo), [rows, yearAgo]);

  const counts = actionCounts(rows, '0000');
  const list = act === 'all' ? rows : rows.filter((r) => r.action === act);
  const shownRows = view === 'timeline' ? list : firms;
  const left = shownRows.length - Math.min(shown, shownRows.length);
  const chips = [
    { id: 'all' as const, label: 'All', tag: String(rows.length) },
    ...(['upgrade', 'downgrade', 'maintain', 'initiate'] as RatingAction[])
      .filter((k) => counts[k]).map((k) => ({ id: k, label: ACTION_LABEL[k], tag: String(counts[k]) })),
  ];

  return (
    <OCard span={8} id="insider-ratings">
      <OHead title="Upgrades & Downgrades" className="flex-wrap"
        info="Every rating action a named firm has published on the stock, newest first: an upgrade, a downgrade, a restated rating, or a first rating when a firm starts coverage. Each firm’s own words are kept — Overweight, Outperform and Buy are three firms’ names for much the same call."
        aside={(
          <div className="flex items-center gap-2">
            {savedPill(result)}
            <CsvButton name={`${symbol} rating actions${view === 'firms' ? ' by firm' : act === 'all' ? '' : ` ${act}`}`}
              build={() => ({
                headers: ['Date', 'Firm', 'Action', 'From', 'To'],
                rows: shownRows.map((r) => [r.date, r.firm, ACTION_LABEL[r.action], r.from, r.to]),
              })} />
          </div>
        )} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Seg label="View" value={view} onChange={(v) => { setView(v); setShown(RATING_PAGE); }} items={[
          { id: 'timeline', label: 'Every action' },
          { id: 'firms', label: 'Latest call by firm', title: 'Each firm’s most recent action, for firms that published in the last twelve months.' },
        ]} />
      </div>
      {view === 'timeline' ? (
        <>
          <ChipRail label="Rating action" items={chips} active={act} onChoose={(c) => { setAct(c); setShown(RATING_PAGE); }} />
          {list.length ? (
            <ul className="mt-4 overflow-hidden rounded-lg border border-border">
              {list.slice(0, shown).map((r, i) => (
                <li key={`${r.date}-${r.firm}-${i}`}
                  className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 text-sm even:bg-muted/70 max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-1">
                  <ActionWord action={r.action} />
                  <span className="min-w-0 max-sm:order-3 max-sm:col-span-2">{callText(r)}</span>
                  <span className="whitespace-nowrap text-right text-muted-foreground tnum">{fmtDate(r.date)}</span>
                </li>
              ))}
            </ul>
          ) : <Notice className="mt-4">No actions of this kind on record.</Notice>}
        </>
      ) : firms.length ? (
        <DataTable dense exportName={null}
          headers={[{ label: 'Firm' }, { label: 'Rating' }, { label: 'Action' }, { label: 'Date', num: true }]}
          rows={firms.slice(0, shown).map((r) => {
            // The tag only where it adds something: "Neutral" needs "Hold" beside it, "Hold" does not.
            const side = /^(buy|hold|sell)$/i.test(r.to || '') ? null : SIDE_PILL[ratingSide(r.to) ?? ''];
            return [
              <b key="f" className="font-semibold">{r.firm}</b>,
              <span key="r" className="block">
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  {r.to || 'not stated'}
                  {side ? <Pill tone={side.tone}>{side.label}</Pill> : null}
                </span>
                {r.from && r.from !== r.to ? <span className="block text-micro text-muted-foreground">was {r.from}</span> : null}
              </span>,
              <ActionWord key="a" action={r.action} />,
              <span key="d" className="whitespace-nowrap">{fmtDate(r.date)}</span>,
            ];
          })} />
      ) : <Notice>No firm has published a rating action in the last twelve months.</Notice>}
      {left > 0 ? (
        <Button variant="ghost" size="sm" className="mt-3 self-start" onClick={() => setShown((n) => n + RATING_PAGE)}>
          Show {Math.min(left, RATING_PAGE)} more — {left} left
        </Button>
      ) : null}
      <p className="mt-4 text-tiny leading-relaxed text-muted-foreground/80">
        “Maintains” is a firm publishing again without changing its rating. The record holds the rating only — not the price target or the
        analyst’s name — and each firm counts once however many analysts it has on the stock.
        {view === 'firms' ? ' The buy, hold and sell tags group each firm’s own word; a word that fits none of the three is left untagged.' : ''}
      </p>
    </OCard>
  );
}

function RatingSummaryCard({ rows, result }: { rows: RatingChange[]; result: FeedResult }) {
  const now = nowOf(result);
  const c90 = actionCounts(rows, isoBefore(now, 90));
  const firms = latestByFirm(rows, isoBefore(now, 365));
  const sides = { buy: 0, hold: 0, sell: 0, none: 0 };
  for (const f of firms) sides[ratingSide(f.to) ?? 'none'] += 1;
  const last = rows.find((r) => r.action === 'upgrade' || r.action === 'downgrade');

  return (
    <OCard span={4} id="insider-ratings-summary">
      <OHead title="Rating changes"
        info="Counts of published actions, not of analysts: one firm can act several times. The consensus — every analyst’s current rating, bucketed — is on the Analysts Forecast tab." />
      <OSub className="mt-0">Last 90 days</OSub>
      <StatLines>
        <StatLine label="Upgrades" value={String(c90.upgrade)} tone={c90.upgrade ? 'pos' : ''} />
        <StatLine label="Downgrades" value={String(c90.downgrade)} tone={c90.downgrade ? 'neg' : ''} />
        <StatLine label="Ratings restated" value={String(c90.maintain)} />
        {c90.initiate ? <StatLine label="Coverage started" value={String(c90.initiate)} /> : null}
      </StatLines>
      <OSub>Firms publishing in the last year</OSub>
      <StatLines>
        <StatLine label="Firms" value={String(firms.length)} />
        <StatLine label="Latest call on the buy side" value={String(sides.buy)} tone={sides.buy ? 'pos' : ''} />
        <StatLine label="Latest call a hold" value={String(sides.hold)} />
        <StatLine label="Latest call on the sell side" value={String(sides.sell)} tone={sides.sell ? 'neg' : ''} />
        {sides.none ? <StatLine label="Wording not placed" value={String(sides.none)} /> : null}
      </StatLines>
      {last ? (
        <p className="mt-auto pt-4 text-13 leading-relaxed text-muted-foreground">
          Last change: <b className="font-semibold text-foreground">{last.firm}</b>{' '}
          {last.action === 'upgrade' ? 'upgraded' : 'downgraded'} the stock to {last.to || 'an unstated rating'} on {fmtDate(last.date)}.
        </p>
      ) : null}
    </OCard>
  );
}

/* ==========================================================================
   The tab
   ========================================================================== */

export function InsiderTab({ a }: { a: Analysis }) {
  const symbol = a.facts.symbol;
  const [range, setRange] = React.useState<RangeId>('2Y');

  // Without the deeper list, the hundred rows the report already holds still
  // make a table and a short chart — capped at a hundred, and said so.
  const reportRows = React.useCallback((): TabLoad => {
    const f = a.ds.feeds.insiderTrades;
    return f?.status === 'ok' && Array.isArray(f.data) ? { result: f, cap: f.fromSnapshot ? null : 100 } : null;
  }, [a]);
  const insiders = useTabFeed('insiderHistory', symbol, INSIDER_HISTORY_CAP, reportRows);
  const grades = useTabFeed('gradeActions', symbol, null);

  const txRows = React.useMemo(() => (insiders?.result.status === 'ok' ? normaliseInsiderTrades(insiders.result.data) : []), [insiders]);
  const ratingRows = React.useMemo(() => (grades?.result.status === 'ok' ? normaliseRatingActions(grades.result.data) : []), [grades]);

  let insiderPart: React.ReactNode;
  if (!insiders) {
    insiderPart = <LoadingCard id="insider-loading" title="Insider buying and selling" what="insider filings" />;
  } else if (insiders.result.status !== 'ok') {
    insiderPart = (
      <OCard span={12} id="insider-none">
        <OHead title="Insider buying and selling" />
        <FeedGate a={gateShim(insiders.result)} feed="insiderHistory" what="Insider filings" />
      </OCard>
    );
  } else if (!txRows.length) {
    insiderPart = (
      <OCard span={12} id="insider-empty">
        <OHead title="Insider buying and selling" />
        <Notice>No Form 3 or Form 4 filings are on record for {symbol}. A company listed outside the US reports insider dealing to its home regulator instead.</Notice>
      </OCard>
    );
  } else {
    insiderPart = (
      <>
        <FlowCard a={a} rows={txRows} result={insiders.result} cap={insiders.cap} range={range} setRange={setRange} />
        <SummaryCard a={a} rows={txRows} result={insiders.result} cap={insiders.cap} range={range} />
        <TransactionsCard a={a} rows={txRows} result={insiders.result} />
      </>
    );
  }

  let ratingPart: React.ReactNode;
  if (!grades) {
    ratingPart = <LoadingCard id="insider-ratings-loading" title="Upgrades & Downgrades" what="rating actions" />;
  } else if (grades.result.status !== 'ok') {
    ratingPart = (
      <OCard span={12} id="insider-ratings-none">
        <OHead title="Upgrades & Downgrades" />
        <FeedGate a={gateShim(grades.result)} feed="gradeActions" what="Rating actions" />
      </OCard>
    );
  } else if (!ratingRows.length) {
    ratingPart = (
      <OCard span={12} id="insider-ratings-empty">
        <OHead title="Upgrades & Downgrades" />
        <Notice>No firm has published a rating action on {symbol}. Coverage is thin or absent for most companies outside the large caps.</Notice>
      </OCard>
    );
  } else {
    ratingPart = (
      <>
        <RatingsCard symbol={symbol} rows={ratingRows} result={grades.result} />
        <RatingSummaryCard rows={ratingRows} result={grades.result} />
      </>
    );
  }

  return (
    <OGrid>
      {insiderPart}
      {ratingPart}
    </OGrid>
  );
}
