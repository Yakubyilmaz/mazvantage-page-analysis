'use client';

/* ==========================================================================
   Maz Vantage — Research › Valuation and Research › Dividends
   (`/research/valuation?symbol=AAPL`, `/research/dividends?symbol=AAPL`)

   The company report's Valuation and Dividends tabs, mounted inside the
   Research page instead of the menu sending the reader out to the report.
   They are the report's own components — `FactorTab` on the valuation factor
   and `DividendsTab` — over the same `loadReport` dataset, so the two places
   cannot disagree; only the frame differs: a Research hero, a two-tab bar and
   a company picker.

   The company is `?symbol=` when the URL names one, else the company last
   opened anywhere in the app (`lastSymbol`, read after mount — the server
   has no sessionStorage), which falls back to AAPL, whose bundled snapshot
   loads without a key.

   Links inside the tabs that point at the other one stay on this page; the
   rest (Analysis anchors, the other four factors) open the full report for
   the same company.
   ========================================================================== */

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { curSymbol, dec, isNum, pct, price } from '@/lib/format';
import { loadReport, type ReportLoad } from '@/lib/report-load';
import { TAB_FOR_FACTOR } from '@/lib/routes';
import { cleanSymbol, isSymbol } from '@/lib/watchlists';
import { FactorTab } from '@/components/report/factor-view';
import { DividendsTab } from '@/components/report/tabs/dividends-tab';
import { Logo, Notice } from '@/components/report/ui';
import { PageFrame, PageHero, SectionBar } from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { NavOverride, lastSymbol, rememberSymbol, useNav, type Nav } from '@/components/nav-context';
import { useDataEpoch } from '@/components/providers';
import { cn } from '@/lib/cn';

export type ResearchTabId = 'valuation' | 'dividends';

const TABS: { id: ResearchTabId; label: string; reportTab: string; strap: string }[] = [
  { id: 'valuation', label: 'Valuation', reportTab: 'Valuation',
    strap: 'The report’s Valuation tab for one company: every valuation ratio ranked against its own sector, and the fair-value models with the range they span.' },
  { id: 'dividends', label: 'Dividends', reportTab: 'Dividends',
    strap: 'The report’s Dividends tab for one company: yield history, cover, growth and the payment record.' },
];

export function ResearchReportTab({ tab }: { tab: ResearchTabId }) {
  const nav = useNav();
  const router = useRouter();
  const params = useSearchParams();
  const { epoch } = useDataEpoch();
  const meta = TABS.find((t) => t.id === tab) || TABS[0];

  const fromUrl = cleanSymbol(params?.get('symbol'));
  const [remembered, setRemembered] = React.useState<string | null>(null);
  React.useEffect(() => { setRemembered(lastSymbol()); }, []);
  const sym = isSymbol(fromUrl) ? fromUrl : remembered;

  const [load, setLoad] = React.useState<ReportLoad | null>(null);
  const [other, setOther] = React.useState('');

  React.useEffect(() => {
    if (!sym) return;
    let live = true;
    setLoad(null);
    loadReport(sym).then((r) => {
      if (!live) return;
      setLoad(r);
      if (r.status === 'ok') rememberSymbol(sym);
    }).catch((err) => {
      if (live) setLoad({ status: 'error', title: `Could not build a report for ${sym}`, message: `Unexpected error: ${err?.message || err}` });
    });
    return () => { live = false; };
  }, [sym, epoch]);

  const go = (id: ResearchTabId, symbol: string | null = sym) => nav.goView('research', id, symbol ? { symbol } : null);

  /* A tab on this page for this company stays here; anything else opens the report. */
  const override = React.useMemo<Partial<Nav>>(() => ({
    goSymbolTab: (t, symbol = null) => {
      const s = symbol ? String(symbol).toUpperCase() : sym;
      const here = TABS.find((x) => x.reportTab === t);
      if (here && s === sym) nav.goView('research', here.id, s ? { symbol: s } : null);
      else nav.goSymbolTab(t, s);
    },
    openFactor: (key) => (key === 'valuation'
      ? nav.goView('research', 'valuation', sym ? { symbol: sym } : null)
      : nav.goSymbolTab(TAB_FOR_FACTOR[key] || 'Analysis', sym)),
    openAnalysis: (anchor) => { if (sym) router.push(nav.hrefFor.symbol(sym, 'Analysis', anchor ?? null)); },
  }), [nav, router, sym]);

  const pick = (e: React.FormEvent) => {
    e.preventDefault();
    const s = cleanSymbol(other);
    if (!isSymbol(s)) return;
    setOther('');
    go(tab, s);
  };

  const ok = load?.status === 'ok' ? load : null;
  const f = ok?.a.facts;
  const up = isNum(f?.change) && f.change > 0;
  const flat = !isNum(f?.change) || f.change === 0;

  return (
    <PageFrame>
      <PageHero eyebrow="Research" title={meta.label} strap={meta.strap} />
      <SectionBar label="Research company tabs" items={TABS} active={tab} onSelect={(id) => go(id)} />

      {/* the company */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border py-5">
        {f ? (
          <div className="flex min-w-0 items-center gap-3">
            <Logo url={f.image} label={f.symbol} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight tracking-[-.015em]">{f.name} <span className="font-semibold text-muted-foreground">({f.symbol})</span></p>
              <p className="text-13 tnum">
                <b className="font-semibold">{price(f.price, curSymbol(f.currency))}</b>
                {isNum(f.change) ? (
                  <span className={cn('ml-2 font-medium text-muted-foreground', !flat && (up ? 'text-up' : 'text-down'))}>
                    {`${up ? '+' : ''}${dec(f.change, 2)} (${pct(f.changePct ?? 0, { sign: true })})`}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold">{sym || '…'}</p>
        )}
        <form onSubmit={pick} className="flex items-center gap-1.5">
          <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Another symbol" aria-label="Show another company"
            className="h-8 w-40 uppercase placeholder:normal-case" maxLength={20} />
          <Button type="submit" size="sm" variant="outline">Show</Button>
        </form>
        {sym ? (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => nav.goSymbolTab(meta.reportTab, sym)}>
            Open the full {sym} report<ArrowUpRight className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="pt-6">
        {!sym || !load ? (
          <p role="status" className="py-14 text-center text-13 text-muted-foreground">Loading {sym ? `the ${sym} report` : 'the company'}…</p>
        ) : load.status === 'error' ? (
          <Notice error>
            <span><b>{load.title}.</b> {load.message}</span>
          </Notice>
        ) : (
          <NavOverride override={override}>
            {load.ds.source === 'snapshot' ? (
              <Notice error={!!load.ds.liveError} className="mb-4">
                {load.ds.liveError
                  ? <>Live data could not be loaded — <b>{load.ds.liveError}</b> — so a <b>saved copy</b> of this report is shown instead.</>
                  : <>Live data is unavailable right now, so a <b>saved copy</b> of this report is shown. Figures are as of the date it was saved.</>}
              </Notice>
            ) : null}
            {tab === 'valuation' ? <FactorTab a={load.a} factorKey="valuation" /> : <DividendsTab a={load.a} />}
          </NavOverride>
        )}
      </div>
    </PageFrame>
  );
}
