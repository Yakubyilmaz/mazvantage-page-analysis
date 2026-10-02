'use client';

/* ==========================================================================
   Maz Vantage — Compare (`/stocks/compare?symbols=AAPL,MSFT,GOOGL`)

   Two to five companies side by side, metric by metric, with the best in
   each row marked. This page used to be a refusal, and the refusal had a
   point worth keeping: two companies agreeing says nothing about whether
   either is any good. So the first block is not raw numbers — it is each
   company's grade **against its own sector**, the reduced composite the
   screens use, with the number of ratios behind it. The raw figures follow
   underneath, and a row's "best" is only ever best among these companies.

   The order is Seeking Alpha's peer comparison: the performance chart first,
   then the table, then a profile card per company. Wall Street's consensus
   sits in the rating block beside the grade, as SA puts its Wall Street row
   beside the quant rating — in words and on its own type, never as a letter
   pill, because it is the sell side's opinion and not a grade of ours.

   - **Cost**: seven requests a company (profile, TTM ratios, TTM metrics,
     the latest fiscal-year growth, a year of prices, the analyst tally and
     the Altman/Piotroski scores) plus one batch quote for all of them, cached
     for ten minutes. Stated on the page before anything else.
   - **Saved comparisons** live in this browser (`mazvantage.comparisons`),
     beside a handful of editorial presets — the sets a reader arriving from
     another research site will look for.
   ========================================================================== */

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { X, Plus, Save, Trash2 } from 'lucide-react';
import { fetchBatchQuotes, fetchFor, logoUrl } from '@/lib/fmp';
import { loadBag } from '@/lib/ideas';
import { scoreLite } from '@/lib/model';
import { FACTOR_KEYS } from '@/lib/factors';
import { MAX_SCORE, letterFor, loadSectorStats, sectorLookup } from '@/lib/grading';
import { fmtDate, isNum, money, mult } from '@/lib/format';
import { cleanSymbol, isSymbol } from '@/lib/watchlists';
import { newId, useStoredJson, writeJson } from '@/lib/local-store';
import { CompareChart, SERIES_COLORS } from '@/components/market/compare-chart';
import { GradePill } from '@/components/report/grade-parts';
import { Logo, Notice } from '@/components/report/ui';
import { CsvButton } from '@/components/csv-button';
import { WatchStar } from '@/components/watch-button';
import { PageFrame, PageHero, useHasKey } from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { useDataEpoch } from '@/components/providers';
import { cn } from '@/lib/cn';

const MAX = 5;
const SAVED_KEY = 'mazvantage.comparisons';
const BAGS = ['profile', 'ratios', 'metrics', 'growth', 'returns', 'grades'] as const;

/** Editorial starting sets. A preset is only a list of symbols — the grades are whatever the data says today. */
const PRESETS: { name: string; symbols: string[] }[] = [
  { name: 'Mega-cap tech', symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'] },
  { name: 'Chipmakers', symbols: ['NVDA', 'AMD', 'AVGO', 'QCOM', 'INTC'] },
  { name: 'Big banks', symbols: ['JPM', 'BAC', 'WFC', 'C', 'GS'] },
  { name: 'Oil majors', symbols: ['XOM', 'CVX', 'COP', 'OXY', 'EOG'] },
  { name: 'Big-box retail', symbols: ['WMT', 'COST', 'TGT', 'HD', 'LOW'] },
  { name: 'Payments', symbols: ['V', 'MA', 'AXP', 'PYPL'] },
];

interface Company {
  symbol: string;
  quote: any;
  bags: Record<string, any>;
  scores: any;
  lite: { score: number | null; scoredOn: number; factors: Record<string, { score: number | null; scoredOn: number }> } | null;
  sector: string | null;
}

type Better = 'high' | 'low' | null;
interface RowSpec { key: string; label: string; get: (c: Company) => unknown; fmt: (v: any) => string; better?: Better; note?: string }

/* ---------- formatting --------------------------------------------------------------------- */

const pctOf = (v: unknown, dp = 1) => (isNum(v) ? `${(v * 100).toFixed(dp)}%` : '—');
const signedPct = (v: unknown, dp = 1) => (isNum(v) ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(dp)}%` : '—');
const dec2 = (v: unknown) => (isNum(v) ? v.toFixed(2) : '—');
const multiple = (v: unknown) => (isNum(v) && v > 0 ? mult(v) : isNum(v) ? 'neg.' : '—');
/** A multiple is only comparable when positive: a negative P/E is a loss, not a bargain. */
const positive = (v: unknown) => (isNum(v) && v > 0 ? v : null);
/** FMP writes 0 for interest cover when it is not meaningful — its empty cell, not a company earning nothing. */
const cover = (v: unknown) => (isNum(v) && v !== 0 ? v : null);

const B = (bag: string, field: string) => (c: Company) => c.bags[bag]?.[field];

const GROUPS: { title: string; rows: RowSpec[] }[] = [
  {
    title: 'Price and size',
    rows: [
      { key: 'price', label: 'Price', get: (c) => c.quote?.price, fmt: (v) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—') },
      { key: 'day', label: 'Day', get: (c) => (isNum(c.quote?.changePercentage) ? c.quote.changePercentage / 100 : null), fmt: (v) => signedPct(v, 2), better: 'high' },
      { key: 'cap', label: 'Market cap', get: (c) => c.quote?.marketCap ?? c.bags.profile?.marketCap, fmt: (v) => money(v) },
      { key: 'beta', label: 'Beta', get: (c) => c.bags.profile?.beta, fmt: dec2 },
      { key: 'range', label: 'Of 52-week range', get: (c) => (isNum(c.quote?.yearHigh) && isNum(c.quote?.yearLow) && c.quote.yearHigh > c.quote.yearLow && isNum(c.quote?.price)
        ? (c.quote.price - c.quote.yearLow) / (c.quote.yearHigh - c.quote.yearLow) : null), fmt: (v) => pctOf(v, 0), note: '0% is the year’s low, 100% its high' },
    ],
  },
  {
    title: 'Valuation',
    rows: [
      { key: 'pe', label: 'P/E (TTM)', get: (c) => positive(B('ratios', 'priceToEarningsRatioTTM')(c)), fmt: multiple, better: 'low' },
      { key: 'peg', label: 'PEG', get: (c) => positive(B('ratios', 'priceToEarningsGrowthRatioTTM')(c)), fmt: multiple, better: 'low' },
      { key: 'ps', label: 'Price / sales', get: (c) => positive(B('ratios', 'priceToSalesRatioTTM')(c)), fmt: multiple, better: 'low' },
      { key: 'pb', label: 'Price / book', get: (c) => positive(B('ratios', 'priceToBookRatioTTM')(c)), fmt: multiple, better: 'low' },
      { key: 'ev', label: 'EV / EBITDA', get: (c) => positive(B('metrics', 'evToEBITDATTM')(c)), fmt: multiple, better: 'low' },
      { key: 'fcfy', label: 'Free cash flow yield', get: B('metrics', 'freeCashFlowYieldTTM'), fmt: (v) => pctOf(v), better: 'high' },
    ],
  },
  {
    title: 'Growth, latest fiscal year',
    rows: [
      { key: 'rev', label: 'Revenue', get: B('growth', 'revenueGrowth'), fmt: (v) => signedPct(v), better: 'high' },
      { key: 'eps', label: 'Earnings per share', get: B('growth', 'epsgrowth'), fmt: (v) => signedPct(v), better: 'high' },
      { key: 'opi', label: 'Operating income', get: B('growth', 'operatingIncomeGrowth'), fmt: (v) => signedPct(v), better: 'high' },
      { key: 'fcfg', label: 'Free cash flow', get: B('growth', 'freeCashFlowGrowth'), fmt: (v) => signedPct(v), better: 'high' },
    ],
  },
  {
    title: 'Profitability',
    rows: [
      { key: 'gm', label: 'Gross margin', get: B('ratios', 'grossProfitMarginTTM'), fmt: (v) => pctOf(v), better: 'high' },
      { key: 'om', label: 'Operating margin', get: B('ratios', 'operatingProfitMarginTTM'), fmt: (v) => pctOf(v), better: 'high' },
      { key: 'nm', label: 'Net margin', get: B('ratios', 'netProfitMarginTTM'), fmt: (v) => pctOf(v), better: 'high' },
      { key: 'roe', label: 'Return on equity', get: B('metrics', 'returnOnEquityTTM'), fmt: (v) => pctOf(v), better: 'high' },
      { key: 'roic', label: 'Return on invested capital', get: B('metrics', 'returnOnInvestedCapitalTTM'), fmt: (v) => pctOf(v), better: 'high' },
    ],
  },
  {
    title: 'Financial health',
    rows: [
      { key: 'cr', label: 'Current ratio', get: B('ratios', 'currentRatioTTM'), fmt: dec2, better: 'high' },
      { key: 'de', label: 'Debt / equity', get: B('ratios', 'debtToEquityRatioTTM'), fmt: dec2, better: 'low' },
      { key: 'ic', label: 'Interest cover', get: (c) => cover(B('ratios', 'interestCoverageRatioTTM')(c)), fmt: (v) => (isNum(v) ? `${v.toFixed(1)}x` : '—'), better: 'high' },
      { key: 'z', label: 'Altman Z-score', get: (c) => c.scores?.altmanZScore, fmt: dec2, better: 'high', note: 'below 1.8 distress, above 3 safe — not meaningful for banks' },
      { key: 'f', label: 'Piotroski F-score', get: (c) => c.scores?.piotroskiScore, fmt: (v) => (isNum(v) ? `${v} / 9` : '—'), better: 'high' },
    ],
  },
  {
    title: 'Momentum',
    rows: [
      { key: 'r1m', label: '1 month', get: B('returns', 'r1m'), fmt: (v) => signedPct(v), better: 'high' },
      { key: 'r6m', label: '6 months', get: B('returns', 'r6m'), fmt: (v) => signedPct(v), better: 'high' },
      { key: 'r1y', label: '1 year', get: B('returns', 'r1y'), fmt: (v) => signedPct(v), better: 'high' },
      { key: 'dd', label: 'Worst fall in the year', get: B('returns', 'drawdown'), fmt: (v) => pctOf(v), better: 'high' },
    ],
  },
  {
    title: 'Dividends',
    rows: [
      { key: 'dy', label: 'Yield (TTM)', get: B('ratios', 'dividendYieldTTM'), fmt: (v) => (isNum(v) && v > 0 ? pctOf(v, 2) : '—'), better: 'high' },
      { key: 'po', label: 'Payout ratio', get: B('ratios', 'dividendPayoutRatioTTM'), fmt: (v) => (isNum(v) && v > 0 ? pctOf(v, 0) : '—') },
    ],
  },
  {
    title: 'Wall Street',
    // The consensus word itself is in the rating block at the top.
    rows: [
      { key: 'ascore', label: 'Analyst rating (0–5)', get: (c) => c.bags.grades?.score, fmt: dec2, better: 'high' },
      { key: 'buy', label: 'Buy or better', get: (c) => c.bags.grades?.buyShare, fmt: (v) => pctOf(v, 0), better: 'high' },
      { key: 'n', label: 'Analysts', get: (c) => c.bags.grades?.total, fmt: (v) => (isNum(v) ? String(v) : '—') },
    ],
  },
];

/** The column holding the best value in a row, or none when fewer than two can be compared. */
function bestOf(spec: RowSpec, companies: Company[]): number | null {
  if (!spec.better) return null;
  const vals = companies.map((c) => spec.get(c)).map((v) => (isNum(v) ? v : null));
  if (vals.filter((v) => v !== null).length < 2) return null;
  let best: number | null = null;
  vals.forEach((v, i) => {
    if (v === null) return;
    if (best === null || (spec.better === 'high' ? v > (vals[best] as number) : v < (vals[best] as number))) best = i;
  });
  return best;
}

/* ---------- Wall Street's rating ------------------------------------------------------------------ */

/** FMP's consensus words, coloured as the report head colours its consensus chip. */
const streetTone = (word: string) => (/strong buy|^buy/i.test(word) ? 'text-up' : /sell/i.test(word) ? 'text-down' : /hold|neutral/i.test(word) ? 'text-grade-mid' : 'text-foreground');

/**
 * The sell side's consensus for the rating block: the word, the tally's mean
 * on the 0–5 scale `gradesFromFeed` shares with the composite, and how many
 * analysts it averages. Bold coloured words rather than a pill, so it cannot
 * be read as one of our grades.
 */
function StreetRating({ g }: { g: any }) {
  if (!g || !isNum(g.total)) return <span className="text-muted-foreground/70">no coverage</span>;
  const word = typeof g.consensus === 'string' ? g.consensus.trim() : '';
  const tally = `${g.strongBuy} strong buy · ${g.buy} buy · ${g.hold} hold · ${g.sell} sell · ${g.strongSell} strong sell`;
  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5" title={tally}>
      <span className="whitespace-nowrap">
        {word ? <b className={cn('mr-1.5 text-13 font-bold', streetTone(word))}>{word}</b> : null}
        <span className="tnum">{dec2(g.score)}</span>
      </span>
      <span className="whitespace-nowrap text-micro text-muted-foreground">{g.total} {g.total === 1 ? 'analyst' : 'analysts'}</span>
    </span>
  );
}

/* ---------- profiles ----------------------------------------------------------------------------- */

/** Long enough that five lines of it will be clamped — below that the toggle would do nothing. */
const LONG_DESCRIPTION = 280;

/** The vendor's website as a link label, or null when it is not a plain http(s) address. */
function siteOf(raw: unknown): { href: string; label: string } | null {
  const href = typeof raw === 'string' ? raw.trim() : '';
  if (!/^https?:\/\/[^\s]+$/i.test(href)) return null;
  return { href, label: href.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') };
}

/**
 * One company's profile card — who it is, what it does, where and how big —
 * the block Seeking Alpha closes its peer comparison with. All of it is the
 * profile feed the grades already bought, so it costs nothing. The top rule
 * carries the company's colour on the chart above.
 */
function ProfileCard({ c, color }: { c: Company; color: string }) {
  const nav = useNav();
  const [open, setOpen] = React.useState(false);
  const p = c.bags.profile || {};
  const name = c.quote?.name || p.companyName || c.symbol;
  const employees = Number(p.fullTimeEmployees);
  const site = siteOf(p.website);
  const description = typeof p.description === 'string' ? p.description.trim() : '';
  const facts: [string, React.ReactNode][] = [
    ['Headquarters', [p.city, p.state, p.country].filter(Boolean).join(', ') || '—'],
    ['Employees', employees > 0 ? employees.toLocaleString('en-US') : '—'],
    ['CEO', p.ceo || '—'],
    ['Listed since', p.ipoDate ? fmtDate(p.ipoDate) : '—'],
    ['Website', site ? <a href={site.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{site.label}</a> : '—'],
  ];
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-t-[3px] border-border p-4" style={{ borderTopColor: color }}>
      <header className="flex items-center gap-2.5">
        <Logo url={p.image || logoUrl(c.symbol)} label={c.symbol} />
        <div className="min-w-0">
          <button type="button" onClick={() => nav.goSymbol(c.symbol)} title={name} className="block max-w-full truncate text-left text-sm font-bold hover:text-primary">{name}</button>
          <p className="text-micro text-muted-foreground">{[c.symbol, p.exchange].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      {p.sector || p.industry ? <p className="text-tiny font-semibold">{[p.sector, p.industry].filter(Boolean).join(' · ')}</p> : null}
      {description ? (
        <div>
          <p className={cn('text-13 leading-relaxed text-muted-foreground', !open && 'line-clamp-5')}>{description}</p>
          {description.length > LONG_DESCRIPTION ? (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 text-tiny font-semibold text-primary hover:underline">
              {open ? 'Show less' : 'Read more'}
            </button>
          ) : null}
        </div>
      ) : <p className="text-13 text-muted-foreground/70">No company description is available.</p>}
      <dl className="mt-auto grid gap-1.5 border-t border-border pt-3 text-tiny">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="flex-none text-muted-foreground">{k}</dt>
            <dd className="min-w-0 truncate text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/* ---------- loading ------------------------------------------------------------------------------ */

async function loadCompany(symbol: string, quote: any, stats: any): Promise<Company> {
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const bags: Record<string, any> = {};
  await Promise.all(BAGS.map(async (b) => { bags[b] = (await loadBag(b, symbol, b === 'returns' ? { from } : {})) || null; }));
  const scoresRes = await fetchFor('scores', symbol);
  const sector = bags.profile?.sector || null;
  let lite: Company['lite'] = null;
  if (stats && sector) {
    const lookup = sectorLookup(stats, sector);
    if (lookup.available) lite = scoreLite(bags, lookup);
  }
  return { symbol, quote, bags, scores: scoresRes.status === 'ok' ? scoresRes.data : null, lite, sector };
}

function parseSymbols(raw: string | null | undefined): string[] {
  return [...new Set(String(raw || '').split(/[\s,;]+/).map(cleanSymbol).filter(isSymbol))].slice(0, MAX);
}

/* ==========================================================================
   The page
   ========================================================================== */

export function ComparePage() {
  const nav = useNav();
  const params = useSearchParams();
  const has = useHasKey();
  const { epoch } = useDataEpoch();
  const symbols = React.useMemo(() => parseSymbols(params?.get('symbols')), [params]);
  const key = symbols.join(',');
  const [state, setState] = React.useState<{ status: string; companies: Company[]; message?: string }>({ status: 'idle', companies: [] });
  const [adding, setAdding] = React.useState('');
  const [saveName, setSaveName] = React.useState<string | null>(null);
  const saved = useStoredJson<{ id: string; name: string; symbols: string[] }[]>(SAVED_KEY, []);
  const savedList = Array.isArray(saved) ? saved.filter((s) => s && Array.isArray(s.symbols) && typeof s.name === 'string') : [];

  const go = (next: string[]) => nav.goView('stocks', 'compare', next.length ? { symbols: next.slice(0, MAX).join(',') } : null);

  React.useEffect(() => {
    if (!symbols.length) { setState({ status: 'idle', companies: [] }); return; }
    if (!has) { setState({ status: 'skipped', companies: [] }); return; }
    let live = true;
    setState({ status: 'loading', companies: [] });
    (async () => {
      const [stats, quotes] = await Promise.all([loadSectorStats().catch(() => null), fetchBatchQuotes(symbols)]);
      const bySymbol = new Map((quotes.status === 'ok' ? quotes.data || [] : []).map((q: any) => [String(q.symbol).toUpperCase(), q]));
      const companies = await Promise.all(symbols.map((s) => loadCompany(s, bySymbol.get(s) || null, stats)));
      if (live) setState({ status: 'ok', companies });
    })().catch((e) => { if (live) setState({ status: 'error', companies: [], message: String(e?.message || e) }); });
    return () => { live = false; };
  }, [key, has, epoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const s = cleanSymbol(adding);
    if (!isSymbol(s) || symbols.includes(s) || symbols.length >= MAX) return;
    setAdding('');
    go([...symbols, s]);
  };
  const saveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    const name = (saveName || '').trim() || symbols.join(' vs ');
    writeJson(SAVED_KEY, [...savedList.filter((s) => s.name !== name), { id: newId('cmp'), name, symbols }]);
    setSaveName(null);
  };

  const companies = state.companies;
  const nameOf = (c: Company) => c.quote?.name || c.bags.profile?.companyName || c.symbol;

  const exportTable = () => ({
    headers: ['Group', 'Metric', ...companies.map((c) => c.symbol)],
    rows: [
      ['Maz Vantage grade', 'Composite (0–5)', ...companies.map((c) => (isNum(c.lite?.score) ? +c.lite!.score!.toFixed(4) : null))],
      ...FACTOR_KEYS.map((k) => ['Maz Vantage grade', k, ...companies.map((c) => (isNum(c.lite?.factors?.[k]?.score) ? +c.lite!.factors[k].score!.toFixed(4) : null))]),
      ['Wall Street', 'Consensus', ...companies.map((c) => c.bags.grades?.consensus || null)],
      ...GROUPS.flatMap((g) => g.rows.map((r) => [g.title, r.label, ...companies.map((c) => { const v = r.get(c); return isNum(v) ? v : typeof v === 'string' ? v : null; })])),
    ],
  });

  return (
    <PageFrame>
      <PageHero eyebrow="Stock Screener" title="Compare" strap={
        'Up to five companies side by side. Each is graded first against its own sector — two companies agreeing says nothing about whether either is good — '
        + 'and then compared figure by figure, the best among them marked in each row.'} />

      {/* the set */}
      <div className="grid gap-4 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-2">
          {symbols.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pl-1.5 pr-1 text-13 font-semibold">
              <Logo url={logoUrl(s)} label={s} size="sm" />
              <button type="button" onClick={() => nav.goSymbol(s)} className="hover:text-primary">{s}</button>
              <button type="button" aria-label={`Remove ${s}`} onClick={() => go(symbols.filter((x) => x !== s))} className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-down">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {symbols.length < MAX ? (
            <form onSubmit={add} className="flex items-center gap-1.5">
              <Input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={symbols.length ? 'Add a symbol' : 'A symbol, e.g. AAPL'} aria-label="Add a symbol to the comparison" className="h-8 w-40 uppercase placeholder:normal-case" maxLength={20} />
              <Button type="submit" size="sm" variant="outline"><Plus className="size-3.5" />Add</Button>
            </form>
          ) : <span className="text-tiny text-muted-foreground">Five is the limit — remove one to add another.</span>}
          {symbols.length >= 2 ? (
            saveName === null
              ? <Button size="sm" variant="ghost" onClick={() => setSaveName(symbols.join(' vs '))}><Save className="size-3.5" />Save this comparison</Button>
              : (
                <form onSubmit={saveCurrent} className="flex items-center gap-1.5">
                  <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus aria-label="Name for this comparison" className="h-8 w-56" maxLength={60} />
                  <Button type="submit" size="sm" variant="default">Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSaveName(null)}>Cancel</Button>
                </form>
              )
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-13">
          <span className="text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">Presets</span>
          {PRESETS.map((p) => (
            <button key={p.name} type="button" onClick={() => go(p.symbols)} title={p.symbols.join(', ')}
              className="rounded-full border border-border px-2.5 py-0.5 text-tiny hover:bg-accent">{p.name}</button>
          ))}
        </div>
        {savedList.length ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-13">
            <span className="text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">Saved</span>
            {savedList.map((s) => (
              <span key={s.id} className="inline-flex items-center rounded-full border border-border text-tiny">
                <button type="button" onClick={() => go(s.symbols)} title={s.symbols.join(', ')} className="rounded-l-full py-0.5 pl-2.5 pr-1.5 hover:bg-accent">{s.name}</button>
                <button type="button" aria-label={`Delete the saved comparison ${s.name}`} onClick={() => writeJson(SAVED_KEY, savedList.filter((x) => x.id !== s.id))}
                  className="rounded-r-full py-0.5 pl-1 pr-1.5 text-muted-foreground hover:bg-accent hover:text-down"><Trash2 className="size-3" /></button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-10 pt-8">
        {!symbols.length ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-14 text-center text-13 text-muted-foreground">
            Add two to five symbols above, or start from a preset. The Compare button on any company report opens this page with its peers.
          </p>
        ) : state.status === 'skipped' ? (
          <Notice>Comparing needs live data for each company, which is unavailable right now.</Notice>
        ) : state.status === 'loading' ? (
          <p role="status" className="py-10 text-center text-13 text-muted-foreground">Loading {symbols.length} {symbols.length === 1 ? 'company' : 'companies'} …</p>
        ) : state.status === 'error' ? (
          <Notice error>{state.message || 'The comparison could not be loaded.'}</Notice>
        ) : state.status === 'ok' ? (
          <>
            <section className="grid gap-3">
              <h2 className="text-lg font-bold tracking-[-.015em]">Performance</h2>
              <CompareChart series={companies.map((c) => ({ symbol: c.symbol, name: nameOf(c), shortName: c.symbol }))} initialRange="1Y" height={360} />
            </section>

            <section className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-[-.015em]">Side by side</h2>
                <CsvButton name={`compare ${symbols.join(' ')}`} build={exportTable} />
              </div>
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[640px] border-collapse text-13 tnum">
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="sticky left-0 z-[1] w-56 bg-background py-2 text-left text-micro font-medium uppercase tracking-[.05em] text-muted-foreground">Metric</th>
                      {companies.map((c) => (
                        <th key={c.symbol} scope="col" className="px-3 py-2 text-right align-bottom">
                          <div className="flex items-center justify-end gap-1.5">
                            <WatchStar symbol={c.symbol} />
                            <button type="button" onClick={() => nav.goSymbol(c.symbol)} className="text-13 font-bold hover:text-primary">{c.symbol}</button>
                          </div>
                          <div className="max-w-[180px] truncate text-right text-micro font-normal text-muted-foreground" title={nameOf(c)}>{nameOf(c)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-muted/60"><th scope="rowgroup" colSpan={companies.length + 1} className="px-0 py-2 text-left text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">
                      Ratings — the Maz Vantage grade against each company’s own sector, and Wall Street’s
                    </th></tr>
                    <tr className="border-b border-border">
                      <th scope="row" className="sticky left-0 z-[1] bg-background py-2 text-left font-medium">Composite</th>
                      {companies.map((c) => (
                        <td key={c.symbol} className="px-3 py-2 text-right">
                          {isNum(c.lite?.score)
                            ? <span className="inline-flex items-center gap-1.5"><GradePill score={c.lite!.score} letter={letterFor(c.lite!.score)} /><span className="text-micro text-muted-foreground">{c.lite!.scoredOn} ratios</span></span>
                            : <span className="text-muted-foreground/70">{c.sector ? 'n/a' : 'no sector'}</span>}
                        </td>
                      ))}
                    </tr>
                    {FACTOR_KEYS.map((k) => (
                      <tr key={k} className="border-b border-border">
                        <th scope="row" className="sticky left-0 z-[1] bg-background py-2 text-left font-normal capitalize text-muted-foreground">{k === 'health' ? 'Financial health' : k}</th>
                        {companies.map((c) => {
                          const f = c.lite?.factors?.[k];
                          return <td key={c.symbol} className="px-3 py-2 text-right">{isNum(f?.score) ? <GradePill score={f!.score} letter={letterFor(f!.score)} /> : <span className="text-muted-foreground/70">n/a</span>}</td>;
                        })}
                      </tr>
                    ))}
                    <tr className="border-b border-border">
                      <th scope="row" className="sticky left-0 z-[1] bg-background py-2 text-left font-normal text-muted-foreground">Sector graded against</th>
                      {companies.map((c) => <td key={c.symbol} className="px-3 py-2 text-right text-tiny text-muted-foreground">{c.sector || '—'}</td>)}
                    </tr>
                    <tr className="border-b border-border">
                      <th scope="row" className="sticky left-0 z-[1] bg-background py-2 text-left font-medium"
                        title="The consensus of sell-side analysts, its tally averaged onto the same 0–5 scale. Their opinion, not a Maz Vantage grade.">
                        Wall Street rating<span className="ml-1 text-micro text-muted-foreground/70">ⓘ</span>
                      </th>
                      {companies.map((c) => <td key={c.symbol} className="px-3 py-2 text-right"><StreetRating g={c.bags.grades} /></td>)}
                    </tr>
                    {GROUPS.map((g) => (
                      <React.Fragment key={g.title}>
                        <tr className="bg-muted/60"><th scope="rowgroup" colSpan={companies.length + 1} className="px-0 py-2 text-left text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">{g.title}</th></tr>
                        {g.rows.map((r) => {
                          const best = bestOf(r, companies);
                          return (
                            <tr key={r.key} className="border-b border-border">
                              <th scope="row" className="sticky left-0 z-[1] bg-background py-2 text-left font-normal" title={r.note}>
                                {r.label}{r.note ? <span className="ml-1 text-micro text-muted-foreground/70">ⓘ</span> : null}
                              </th>
                              {companies.map((c, i) => (
                                <td key={c.symbol} className={cn('px-3 py-2 text-right', best === i && 'font-bold text-up')}>
                                  {r.fmt(r.get(c))}{best === i ? <span className="sr-only"> (best of these)</span> : null}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">
                Green marks the best of these companies in a row, never an absolute judgement — the cheapest of five expensive stocks is still expensive,
                which is what the grades above are for. The grades are the reduced composite the screens use (up to 59 ratios from four feeds, each ranked against
                the company’s own sector distribution), not the {MAX_SCORE}-point report grade over all 77, and the ratio count beside each says how much it rests on.
                Multiples are compared only when positive: a negative P/E is a loss, not a bargain. The Wall Street row is the analysts’ consensus put on the
                same scale, printed in words so it is never read as one of the grades above it.
              </p>
            </section>

            <section className="grid gap-3">
              <h2 className="text-lg font-bold tracking-[-.015em]">Company profiles</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
                {companies.map((c, i) => <ProfileCard key={c.symbol} c={c} color={SERIES_COLORS[i % SERIES_COLORS.length]} />)}
              </div>
            </section>

            <p className="text-tiny text-muted-foreground/80">
              Kept for ten minutes — changing the set reuses every company already loaded.
            </p>
          </>
        ) : null}
      </div>
    </PageFrame>
  );
}
