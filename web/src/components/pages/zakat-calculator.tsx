'use client';

/* ==========================================================================
   Maz Vantage — the zakat calculator (Shariah → Zakat)

   The rules and their sources are in `lib/zakat.ts`; this is the page. The
   holdings come from a watchlist's share counts, plus any the reader adds
   here. For each company it loads the price, the market capitalisation and
   the newest balance sheet — live, else the saved copy — so the look-through
   share can be read from the company's own cash, receivables and inventory.
   Anything it cannot load, the reader can type.

   The settings, the added holdings and the other wealth stay in this browser
   only (`mazvantage.zakat`), like the watchlists they sit beside.
   ========================================================================== */

import * as React from 'react';
import { fetchBatchQuotes, fetchFor, fetchHubFeed, hasApiKey, loadSnapshot } from '@/lib/fmp';
import { readJson, writeJson } from '@/lib/local-store';
import { activeList, cleanSymbol, isSymbol, listById, sharesHeld, useWatchlists } from '@/lib/watchlists';
import {
  LONG_METHODS, NISAB_GRAMS, figuresFrom, holdingBase, lookThrough, nisabValue, perGram, rateFor, zakatDue,
  type Intention, type LongMethod, type NisabMetal, type OtherWealth, type YearBasis,
} from '@/lib/zakat';
import { Panel, Para, Warn } from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { useDataEpoch } from '@/components/providers';
import { cn } from '@/lib/cn';

const KEY = 'mazvantage.zakat';

interface Saved {
  basis: YearBasis;
  metal: NisabMetal;
  /** typed price per gram; null uses the loaded one */
  gram: Record<NisabMetal, number | null>;
  method: LongMethod;
  other: OtherWealth;
  intents: Record<string, Intention>;
  prices: Record<string, number>;
  extra: { symbol: string; shares: number }[];
  listId: string | null;
}
const DEFAULTS: Saved = {
  basis: 'lunar', metal: 'gold', gram: { gold: null, silver: null }, method: 'lookthrough',
  other: {}, intents: {}, prices: {}, extra: [], listId: null,
};

interface Company { price: number | null; marketCap: number | null; balance: any | null; source: 'live' | 'saved' | null; name?: string }

const usd = (v: number | null | undefined, dp = 2) => (v == null || !Number.isFinite(v)
  ? '—'
  : `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
const pc = (v: number | null | undefined, dp = 1) => (v == null ? '—' : `${(v * 100).toFixed(dp)}%`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dated = (d: string | null | undefined) => {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
};

function Toggle<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 rounded-full bg-accent p-1">
      {items.map((i) => (
        <button key={i.id} type="button" aria-pressed={value === i.id} onClick={() => onChange(i.id)}
          className={cn('rounded-full px-3 py-1 text-13 font-semibold text-muted-foreground', value === i.id && 'bg-background text-foreground shadow-sm')}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

function Money({ value, onChange, label, placeholder, className }: { value: number | null | undefined; onChange: (v: number | null) => void; label: string; placeholder?: string; className?: string }) {
  const [text, setText] = React.useState(value != null ? String(value) : '');
  React.useEffect(() => setText(value != null ? String(value) : ''), [value]);
  return (
    <Input type="number" min={0} step="any" inputMode="decimal" value={text} aria-label={label} placeholder={placeholder}
      className={cn('h-8 text-right tnum', className)}
      onChange={(e) => { setText(e.target.value); onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value))); }} />
  );
}

/* ---------- loading ------------------------------------------------------------- */

async function loadCompanies(symbols: string[]): Promise<Record<string, Company>> {
  const out: Record<string, Company> = {};
  const live = hasApiKey();
  const quotes: Record<string, any> = {};
  if (live && symbols.length) {
    const r = await fetchBatchQuotes(symbols).catch(() => null);
    if (r?.status === 'ok') for (const q of r.data || []) quotes[q.symbol] = q;
  }
  await Promise.all(symbols.map(async (sym) => {
    let balance: any = null;
    let source: Company['source'] = null;
    let q = quotes[sym] || null;
    if (live) {
      // The newest quarter where it loads: zakat is owed on today's assets, and an annual balance sheet can be a year old.
      const bq = await fetchFor('balanceQ', sym).catch(() => null);
      balance = bq?.status === 'ok' && Array.isArray(bq.data) ? bq.data[0] ?? null : null;
      if (!balance) {
        const ba = await fetchFor('balance', sym).catch(() => null);
        balance = ba?.status === 'ok' && Array.isArray(ba.data) ? ba.data[0] ?? null : null;
      }
      if (q || balance) source = 'live';
    }
    if (!q || !balance) {
      const snap = await loadSnapshot(sym).catch(() => null);
      if (snap?.feeds) {
        q = q || snap.feeds.quote || null;
        balance = balance || (Array.isArray(snap.feeds.balance) ? snap.feeds.balance[0] : null);
        source = source || 'saved';
      }
    }
    out[sym] = {
      price: Number.isFinite(Number(q?.price)) ? Number(q.price) : null,
      marketCap: Number.isFinite(Number(q?.marketCap)) ? Number(q.marketCap) : null,
      balance, source, name: q?.name,
    };
  }));
  return out;
}

async function loadMetals(): Promise<{ gold: number | null; silver: number | null }> {
  if (!hasApiKey()) return { gold: null, silver: null };
  const r = await fetchHubFeed('commodities').catch(() => null);
  if (r?.status !== 'ok') return { gold: null, silver: null };
  const by = Object.fromEntries((r.data || []).map((x: any) => [x.symbol, Number(x.price)]));
  return { gold: perGram(by.GCUSD), silver: perGram(by.SIUSD) };
}

/* ---------- the page ------------------------------------------------------------- */

export function ZakatCalculator() {
  const nav = useNav();
  const { epoch } = useDataEpoch();
  const store = useWatchlists();
  const [saved, setSavedState] = React.useState<Saved>(DEFAULTS);
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => { setSavedState({ ...DEFAULTS, ...readJson<Partial<Saved>>(KEY, {}) }); setHydrated(true); }, []);
  const save = React.useCallback((patch: Partial<Saved>) => {
    setSavedState((s) => { const next = { ...s, ...patch }; writeJson(KEY, next); return next; });
  }, []);

  const list = listById(store, saved.listId) || activeList(store);
  const rows = React.useMemo(() => {
    const fromList = (list?.symbols || [])
      .map((symbol) => ({ symbol, shares: sharesHeld(list?.holdings[symbol]), added: false }))
      .filter((r) => r.shares != null) as { symbol: string; shares: number; added: boolean }[];
    const have = new Set(fromList.map((r) => r.symbol));
    return [...fromList, ...saved.extra.filter((e) => !have.has(e.symbol)).map((e) => ({ ...e, added: true }))];
  }, [list, saved.extra]);
  const symbolsKey = rows.map((r) => r.symbol).join(',');

  const [companies, setCompanies] = React.useState<Record<string, Company>>({});
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!symbolsKey) { setCompanies({}); return; }
    let on = true;
    setLoading(true);
    loadCompanies(symbolsKey.split(',')).then((c) => { if (on) { setCompanies(c); setLoading(false); } });
    return () => { on = false; };
  }, [symbolsKey, epoch]);

  const [metals, setMetals] = React.useState<{ gold: number | null; silver: number | null }>({ gold: null, silver: null });
  React.useEffect(() => { loadMetals().then(setMetals); }, [epoch]);

  const [adding, setAdding] = React.useState({ symbol: '', shares: '' });

  /* ---- the arithmetic ---- */
  const lines = rows.map((r) => {
    const c = companies[r.symbol];
    const price = saved.prices[r.symbol] ?? c?.price ?? null;
    const value = price != null ? price * r.shares : null;
    const intention = saved.intents[r.symbol] || 'long';
    const figures = c ? figuresFrom(c.balance, c.marketCap) : null;
    const look = lookThrough(figures);
    const h = holdingBase({ value, intention, method: saved.method, look: look.share });
    return { ...r, c, price, value, intention, figures, look, h };
  });
  const gram = saved.gram[saved.metal] ?? metals[saved.metal];
  const nisab = nisabValue(saved.metal, gram);
  const result = zakatDue(lines.map((l) => l.h.base), saved.other, nisab, saved.basis);
  const uncounted = lines.filter((l) => l.h.base == null).length;

  if (!hydrated || !store.ready) return <p className="pt-6 text-13 text-muted-foreground">Loading…</p>;

  const other = (k: keyof OtherWealth) => (v: number | null) => save({ other: { ...saved.other, [k]: v } });

  return (
    <div className="grid gap-5 pt-6">
      <Panel title="Zakat on your shares">
        <Para>
          Zakat is due once a year on wealth held above the nisab for a full year. For shares, how much of their value counts depends on why you hold
          them: shares held to sell are trade goods and count in full; shares held for the long term count only for the part of the company that is
          itself zakatable. This page does that arithmetic on the methods two published rulings give, and leaves the choice of method to you.
        </Para>
        <Warn><b>A calculation, not a ruling.</b> Whether zakat is due, from what date, and on which method are questions for your scholar. Nothing here is stored outside this browser.</Warn>
      </Panel>

      <Panel title="1. Settings">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-2">
            <span className="text-13 font-semibold">Your zakat year</span>
            <Toggle label="Zakat year" value={saved.basis} onChange={(basis) => save({ basis })}
              items={[{ id: 'lunar', label: 'Lunar (Hijri), 2.5%' }, { id: 'solar', label: `Solar (Gregorian), ${pc(rateFor('solar'), 3)}` }]} />
            <p className="text-tiny text-muted-foreground">The rate is 2.5% a lunar year. Paying on a solar year, it is commonly scaled up for the 11 extra days: 2.5% × 365 ÷ 354.</p>
          </div>
          <div className="grid content-start gap-2">
            <span className="text-13 font-semibold">Nisab</span>
            <Toggle label="Nisab metal" value={saved.metal} onChange={(metal) => save({ metal })}
              items={[{ id: 'gold', label: `Gold, ${NISAB_GRAMS.gold} g` }, { id: 'silver', label: `Silver, ${NISAB_GRAMS.silver} g` }]} />
            <label className="flex flex-wrap items-center gap-2 text-13">
              <span className="text-muted-foreground">Price per gram</span>
              <Money className="w-28" label={`${saved.metal} price per gram, US dollars`} value={saved.gram[saved.metal]}
                placeholder={metals[saved.metal] != null ? metals[saved.metal]!.toFixed(2) : 'type it'}
                onChange={(v) => save({ gram: { ...saved.gram, [saved.metal]: v } })} />
              <span className="text-tiny text-muted-foreground">
                {saved.gram[saved.metal] != null ? 'your figure' : metals[saved.metal] != null ? 'from the futures price per troy ounce ÷ 31.1035' : 'no live price: type today’s'}
              </span>
            </label>
            <p className="text-tiny text-muted-foreground">Silver gives a far lower threshold than gold at today’s prices. Scholars differ on which to use; ask which yours does.</p>
          </div>
        </div>
        <div className="grid gap-2">
          <span className="text-13 font-semibold">Shares held for the long term are counted by</span>
          <div className="grid gap-2 md:grid-cols-3">
            {LONG_METHODS.map((m) => (
              <button key={m.id} type="button" aria-pressed={saved.method === m.id} onClick={() => save({ method: m.id })}
                className={cn('grid content-start gap-1 rounded-lg border p-3 text-left', saved.method === m.id ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30')}>
                <span className="text-13 font-semibold">{m.label}</span>
                <span className="text-tiny leading-relaxed text-muted-foreground">{m.basis}</span>
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="2. Your shares">
        <div className="flex flex-wrap items-center gap-2 text-13">
          <span className="text-muted-foreground">From the watchlist</span>
          <select aria-label="Watchlist" value={list?.id || ''} onChange={(e) => save({ listId: e.target.value || null })}
            className="h-8 rounded-md border border-border bg-background px-2 text-13">
            {store.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <span className="text-tiny text-muted-foreground">Only names with a share count are used; set them on the Watchlist page.</span>
          <button type="button" onClick={() => nav.goView('watchlist')} className="text-13 font-semibold text-primary hover:underline">Watchlist ›</button>
        </div>
        {lines.length ? (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full border-collapse text-13 tnum">
              <thead><tr className="border-b border-border text-micro uppercase tracking-[.05em] text-muted-foreground">
                <th className="py-2 text-left font-medium">Company</th>
                <th className="px-3 py-2 text-right font-medium">Shares</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Held to</th>
                <th className="px-3 py-2 text-right font-medium">Counts</th>
                <th className="py-2 pl-3 text-right font-medium">Toward zakat</th>
              </tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.symbol} className="border-b border-border align-top">
                    <td className="py-2">
                      <button type="button" onClick={() => nav.goSymbolTab('Shariah Compliance', l.symbol)} className="font-bold hover:text-primary">{l.symbol}</button>
                      {l.added ? <button type="button" aria-label={`Remove ${l.symbol}`} onClick={() => save({ extra: saved.extra.filter((e) => e.symbol !== l.symbol) })} className="ml-2 text-tiny text-muted-foreground hover:text-down">remove</button> : null}
                      <div className="text-[11px] text-muted-foreground">{l.c?.source === 'saved' ? 'saved copy' : l.c?.source === 'live' ? '' : loading ? 'loading…' : 'not loaded'}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{l.shares.toLocaleString('en-US')}</td>
                    <td className="px-3 py-2">
                      {l.c?.price != null && saved.prices[l.symbol] == null
                        ? <span className="block text-right">{usd(l.c.price)}</span>
                        : <Money className="ml-auto w-24" label={`Price of ${l.symbol}`} value={saved.prices[l.symbol]} placeholder="price"
                            onChange={(v) => { const p = { ...saved.prices }; if (v == null) delete p[l.symbol]; else p[l.symbol] = v; save({ prices: p }); }} />}
                    </td>
                    <td className="px-3 py-2 text-right">{usd(l.value, 0)}</td>
                    <td className="px-3 py-2">
                      <Toggle label={`Why you hold ${l.symbol}`} value={l.intention} onChange={(v) => save({ intents: { ...saved.intents, [l.symbol]: v } })}
                        items={[{ id: 'long', label: 'Keep' }, { id: 'trading', label: 'Sell' }]} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div>{l.h.share == null ? '—' : pc(l.h.share, l.h.share < 0.1 && l.h.share > 0 ? 2 : 1)}</div>
                      {l.intention === 'long' && saved.method === 'lookthrough' ? (
                        <div className="text-[11px] text-muted-foreground" title={l.look.missing.length ? `Not in the data, counted as zero: ${l.look.missing.join(', ')}` : undefined}>
                          {l.look.share == null ? 'no balance sheet' : `balance sheet ${dated(l.figures?.asOf)}${l.look.missing.length ? ` · no ${l.look.missing.join(', ')}` : ''}`}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pl-3 text-right font-semibold">{usd(l.h.base, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-13 text-muted-foreground">No holdings with a share count yet. Add one below, or set share counts on the Watchlist page.</p>
        )}
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
          e.preventDefault();
          const symbol = cleanSymbol(adding.symbol);
          const shares = Number(adding.shares);
          if (!isSymbol(symbol) || !(shares > 0)) return;
          save({ extra: [...saved.extra.filter((x) => x.symbol !== symbol), { symbol, shares }] });
          setAdding({ symbol: '', shares: '' });
        }}>
          <Input aria-label="Ticker to add" placeholder="Ticker" value={adding.symbol} className="h-8 w-28" onChange={(e) => setAdding((a) => ({ ...a, symbol: e.target.value }))} />
          <Input aria-label="Shares held" placeholder="Shares" type="number" min={0} step="any" value={adding.shares} className="h-8 w-28 text-right" onChange={(e) => setAdding((a) => ({ ...a, shares: e.target.value }))} />
          <Button size="sm" type="submit" variant="outline">Add holding</Button>
        </form>
        <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">
          “Counts” is the share of the market value that is zakatable. On the look-through method it is the company’s cash and short-term investments,
          receivables and inventory over its market capitalisation, from its newest balance sheet; a line the data does not carry counts as zero, so the figure
          is a floor. Value is today’s price where one loaded; otherwise type it. Prices are in US dollars.
        </p>
      </Panel>

      <Panel title="3. Your other zakatable wealth">
        <Para>The nisab is tested on everything you own that is zakatable, not on the shares alone, and debts due now come off first.</Para>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ['cash', 'Cash and savings', saved.method === 'dividends' ? 'include the dividends you received' : 'bank balances and cash in hand'],
            ['metals', 'Gold and silver you own', 'their value today'],
            ['owedToYou', 'Money owed to you', 'that you expect to be repaid'],
            ['goods', 'Goods held for sale', 'business stock, at today’s value'],
            ['debts', 'Less: debts due now', 'what you must pay now, not the whole of a long loan'],
          ] as [keyof OtherWealth, string, string][]).map(([k, label, hint]) => (
            <label key={k} className="grid gap-1 text-13">
              <span className={cn('font-semibold', k === 'debts' && 'text-down')}>{label}</span>
              <Money label={label} value={saved.other[k]} onChange={other(k)} placeholder="0" />
              <span className="text-tiny text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
      </Panel>

      <Panel title="4. Zakat due">
        <dl className="grid max-w-[560px] grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-13 tnum">
          <dt className="text-muted-foreground">Shares, the part that counts</dt><dd className="text-right">{usd(result.shares, 0)}</dd>
          <dt className="text-muted-foreground">Other zakatable wealth</dt><dd className="text-right">{usd(result.other, 0)}</dd>
          <dt className="text-muted-foreground">Less debts due now</dt><dd className="text-right">{result.debts ? `−${usd(result.debts, 0)}` : usd(0, 0)}</dd>
          <dt className="border-t border-border pt-1.5 font-semibold">Zakatable wealth</dt><dd className="border-t border-border pt-1.5 text-right font-semibold">{usd(result.wealth, 0)}</dd>
          <dt className="text-muted-foreground">Nisab, {NISAB_GRAMS[saved.metal]} g of {saved.metal}{gram != null ? ` at ${usd(gram)} a gram` : ''}</dt>
          <dd className="text-right">{nisab == null ? 'needs a price' : usd(nisab, 0)}</dd>
          <dt className="text-muted-foreground">Rate, {saved.basis === 'lunar' ? 'lunar' : 'solar'} year</dt><dd className="text-right">{pc(result.rate, saved.basis === 'lunar' ? 1 : 3)}</dd>
        </dl>
        <div className="flex flex-wrap items-baseline gap-3 rounded-xl bg-muted px-4 py-3">
          <span className="text-13 text-muted-foreground">Zakat due</span>
          <strong className="text-2xl tnum">{result.due == null ? '—' : usd(result.due)}</strong>
          <span className="text-tiny text-muted-foreground">
            {result.aboveNisab == null ? 'enter the metal’s price per gram to test the nisab'
              : result.aboveNisab ? 'your zakatable wealth is above the nisab'
                : 'below the nisab, so no zakat is due on these figures'}
          </span>
        </div>
        {uncounted ? <p className="text-tiny text-down">{uncounted} holding{uncounted === 1 ? ' is' : 's are'} not counted: {uncounted === 1 ? 'its' : 'their'} price or balance sheet did not load. Type a price, or choose the 30% method.</p> : null}
        <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">
          Zakat is due when the wealth has stayed at or above the nisab for a full year (the hawl); this page cannot know that, so it tests today’s figures
          only. Sources: the International Islamic Fiqh Academy’s{' '}
          <a href="https://iifa-aifi.org/en/32294.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Resolution No. 28 (3/4) on zakat on company shares</a> (1988),
          and the Fiqh Council of North America’s{' '}
          <a href="https://fiqhcouncil.org/zakah-on-stocks/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ruling on zakat on stocks</a>.
          Purification of impure income is a separate obligation, on the Purification tab.
        </p>
      </Panel>
    </div>
  );
}
