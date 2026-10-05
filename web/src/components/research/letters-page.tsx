'use client';

/* ==========================================================================
   Maz Vantage — Research → Letters & Outlooks (`/research/letters`)

   Other houses' published thinking, filed by month: outlooks, fund letters,
   memos, chart books and the official forecasters. Every title opens the
   publisher's own copy in a new tab; nothing is hosted here. The model,
   the entries and the rules they keep are `lib/letters.ts`.

   Same contract as the feed: the URL is the filter state, every control
   writes the address, and the back button steps back through filters. It
   goes through `nav.goView`, not `goQuery` — that one keeps only the feed's
   own filter keys and would silently drop these.
   ========================================================================== */

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import {
  CHECKED, FIRMS, FIRM_BY_KEY, FIRM_TYPES, KINDS, REGIONS, SORTS, TABS, TOPICS,
  activeLetterChips, companyRows, dateLabel, facetCounts, firmOf, firmTypeOne, groupLetters, hostOf, investorRows, kindLabel,
  mergeLetterQuery, monthLabel, overlaps, parseLetterQuery, queryLetters, topicLabel,
  type CompanyRow, type Firm, type InvestorRow, type Letter, type LetterQuery, type Mention, type TabKey,
} from '@/lib/letters';
import { Field, FilterText, ResearchHero, ResearchStrip, RsPill, inputCls } from '@/components/research/feed-parts';
import { InstrumentMark } from '@/components/market/market-ui';
import { PageFrame } from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { useNav } from '@/components/nav-context';
import { logoUrl } from '@/lib/fmp';
import { Logo } from '@/components/report/ui';
import { cn } from '@/lib/cn';

const BLURB = 'What the large houses and the best-known funds are telling their own clients — each linked to the publisher’s copy.';

type Go = (change: Partial<Record<keyof LetterQuery, string | null>>) => void;
type FacetKeyName = 'firm' | 'who' | 'topic' | 'region';

/* Module-level, like the feed's: a drawer that closed on every filter click would be unusable. */
let drawerOpen = false;

/* ==========================================================================
   Pieces
   ========================================================================== */

/** "Oaktree Capital Management" -> "OC"; an acronym keeps itself ("OECD", "GMO"); one word gives two letters. */
function initials(name: string) {
  const words = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const w = words[0] || '';
  return w === w.toUpperCase() && w.length <= 4 ? w : w.slice(0, 2).toUpperCase();
}

/** The firm's logo where it has a US listing, its initials where it has not. */
function FirmMark({ firm }: { firm: Firm }) {
  const [failed, setFailed] = React.useState(false);
  return (
    <span aria-hidden="true"
      className="relative grid size-[34px] flex-none place-items-center overflow-hidden rounded-full bg-foreground text-[10px] font-semibold text-background">
      {initials(firm.name)}
      {firm.ticker && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl(firm.ticker)!} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}
          className={cn('absolute inset-0 size-full object-contain p-[3px]', firm.logoOnDark ? 'bg-black' : 'bg-white')} />
      ) : null}
    </span>
  );
}

/** Out to the publisher: a real link, new tab, marked as leaving. */
function OutLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1 font-semibold text-primary hover:underline', className)}>
      {children}<ArrowUpRight aria-hidden="true" className="size-3.5" />
      <span className="sr-only"> (opens the publisher’s site in a new tab)</span>
    </a>
  );
}

/** A company the letter names: a link to its report when it has a US listing, plain text when not. */
function MentionChip({ x }: { x: Mention }) {
  const nav = useNav();
  if (!x.ticker) {
    return <span className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-0.5 text-tiny text-muted-foreground" title="No US listing">{x.name}</span>;
  }
  return (
    <button type="button" aria-label={`${x.ticker}, ${x.name}: open the report`} title={x.name} onClick={() => nav.goSymbolTab(null, x.ticker)}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pl-1 pr-2.5 text-tiny hover:border-primary hover:text-primary">
      <Logo url={logoUrl(x.ticker)} label={x.ticker} size="sm" fallback="none" className="size-4 rounded-full" />
      <b className="font-semibold">{x.ticker}</b>
    </button>
  );
}

const ACTION_LABEL: Record<Mention['action'], string> = { bought: 'Opened', sold: 'Exited', discussed: 'Discussed' };

function Mentions({ list }: { list: Mention[] }) {
  const groups = (['bought', 'sold', 'discussed'] as const).map((a) => [a, list.filter((x) => x.action === a)] as const).filter(([, xs]) => xs.length);
  return (
    <div className="grid gap-1.5 rounded-lg bg-muted px-3 py-2.5">
      {groups.map(([action, xs]) => (
        <div key={action} className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-2">
          <span className={cn('pt-1 text-micro font-semibold uppercase tracking-[.06em]',
            action === 'bought' ? 'text-up' : action === 'sold' ? 'text-down' : 'text-muted-foreground')}>{ACTION_LABEL[action]}</span>
          <span className="flex flex-wrap gap-1.5">{xs.map((x) => <MentionChip key={x.name} x={x} />)}</span>
        </div>
      ))}
    </div>
  );
}

function LetterRow({ l, go }: { l: Letter; go: Go }) {
  const firm = firmOf(l);
  const where = hostOf(l.url);
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 border-b border-border py-5 last:border-b-0">
      <FirmMark firm={firm} />
      <div className="grid min-w-0 gap-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-tiny text-muted-foreground">
          <button type="button" onClick={() => go({ firm: firm.key })}
            className="font-semibold text-foreground hover:text-primary">{firm.name}</button>
          <span aria-hidden="true">·</span>
          <span className="rounded bg-accent px-1.5 py-px text-micro font-semibold uppercase tracking-[.05em]">{kindLabel(l.kind)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={l.date}>{dateLabel(l.date)}</time>
          {l.period ? <><span aria-hidden="true">·</span><span>Covers {l.period}</span></> : null}
          {l.auto ? <><span aria-hidden="true">·</span><span className="italic">Filed automatically</span></> : null}
        </p>
        <h3 className="text-[15px] font-semibold leading-snug">
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">{l.title}</a>
        </h3>
        {l.authors?.length ? <p className="text-tiny text-muted-foreground">By {l.authors.join(', ')}</p> : null}
        {l.about ? <p className="max-w-[78ch] text-13 leading-relaxed text-muted-foreground">{l.about}</p> : null}
        {l.mentions?.length ? <Mentions list={l.mentions} /> : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5 text-13">
          <OutLink href={l.url}>
            {l.rolling ? 'Current edition' : 'Read'} at {where}{l.format === 'pdf' ? ` · PDF${l.pages ? `, ${l.pages} pp` : ''}` : ''}
          </OutLink>
          {l.pdf ? <OutLink href={l.pdf}>PDF</OutLink> : null}
          {l.rolling ? <span className="text-tiny text-muted-foreground">The publisher reuses this address for each new edition.</span> : null}
          <span className="flex flex-wrap gap-1.5">
            {l.topics.map((t) => (
              <button key={t} type="button" onClick={() => go({ topic: t })}
                className="rounded-full border border-border px-2 py-px text-tiny text-muted-foreground hover:border-foreground hover:text-foreground">
                {topicLabel(t)}
              </button>
            ))}
          </span>
        </div>
      </div>
    </article>
  );
}

/* ==========================================================================
   The side column
   ========================================================================== */

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h2 className="mb-3 text-[15px] font-semibold tracking-[-.01em]">{title}</h2>
      {children}
    </section>
  );
}

function Agreement({ go }: { go: Go }) {
  const nav = useNav();
  const rows = overlaps();
  if (!rows.length) return null;
  return (
    <SideCard title="Where the letters agree">
      <p className="mb-3 text-tiny leading-relaxed text-muted-foreground">Companies that two or more firms say they bought — or sold — in the letters on file.</p>
      <ul className="grid gap-2.5">
        {rows.map((r) => (
          <li key={`${r.action}:${r.ticker}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
            <button type="button" onClick={() => nav.goSymbolTab(null, r.ticker)} aria-label={`${r.ticker}, ${r.name}: open the report`}>
              <InstrumentMark row={{ symbol: r.ticker, kind: 'stock' }} />
            </button>
            <span className="min-w-0 leading-tight">
              <b className="block truncate text-13">{r.name}</b>
              <small className={cn('block text-micro leading-snug', r.action === 'bought' ? 'text-up' : 'text-down')}>
                {r.action === 'bought' ? 'Bought' : 'Sold'} by {r.firms.map((k) => FIRMS.find((f) => f.key === k)!.name).join(' and ')}
              </small>
            </span>
            <button type="button" onClick={() => go({ ticker: r.ticker })} className="text-tiny font-semibold text-primary hover:underline">
              {r.letters.length} letters
            </button>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}

function MostActive({ rows, go }: { rows: InvestorRow[]; go: Go }) {
  if (!rows.length) return null;
  return (
    <SideCard title="Most on file">
      <ul className="grid gap-2">
        {rows.slice(0, 8).map((r) => (
          <li key={r.firm.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
            <FirmMark firm={r.firm} />
            <button type="button" onClick={() => go({ firm: r.firm.key, tab: null })} className="min-w-0 text-left leading-tight hover:text-primary">
              <b className="block truncate text-13">{r.firm.name}</b>
              <small className="block text-micro text-muted-foreground">latest {dateLabel(r.latest.date)}</small>
            </button>
            <span className="text-tiny text-muted-foreground tnum">{r.count}</span>
          </li>
        ))}
      </ul>
      {rows.length > 8 ? (
        <button type="button" onClick={() => go({ tab: 'investors' })} className="mt-3 text-13 font-semibold text-primary hover:underline">
          All {rows.length} investors →
        </button>
      ) : null}
    </SideCard>
  );
}

function Method() {
  return (
    <SideCard title="How this list is made">
      <div className="grid gap-2 text-tiny leading-relaxed text-muted-foreground">
        <p><b className="text-foreground">Links, not copies.</b> Every title opens the publisher’s own page or file. The documents are the firms’ — nothing is hosted or edited here.</p>
        <p><b className="text-foreground">Built from the publishers.</b> Each firm’s own letters or insights page was read, and every link opened, on {dateLabel(CHECKED)}. Titles and dates are as the firm prints them; a document dated only by month shows the month.</p>
        <p><b className="text-foreground">Summary lines are ours</b> and appear only on documents we have read in full; the views in them are the firm’s. The rest are listed, not summarised.</p>
        <p><b className="text-foreground">“Filed automatically”</b> marks a document a crawler found on the firm’s own site and opened to read its title and date. Its kind and topics were assigned from the title, so they can be wrong; the document itself is the publisher’s.</p>
        <p><b className="text-foreground">Companies are as the letter names them</b>: positions a fund says it opened or exited, and holdings it discusses. One without a US listing is named but not linked.</p>
        <p>A link marked “current edition” is an address the publisher reuses each quarter. Nothing here is a recommendation by Maz Vantage.</p>
      </div>
    </SideCard>
  );
}

/* ==========================================================================
   The other two tables
   ========================================================================== */

const th = 'whitespace-nowrap border-b border-border px-3 py-2 text-left text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground';
const td = 'border-b border-border px-3 py-2.5 align-top';

function InvestorsTable({ rows, go }: { rows: InvestorRow[]; go: Go }) {
  const nav = useNav();
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] border-collapse text-13">
        <thead>
          <tr>
            <th scope="col" className={th}>Investor</th>
            <th scope="col" className={cn(th, 'text-right')}>Documents</th>
            <th scope="col" className={th}>Kinds</th>
            <th scope="col" className={th}>Coverage</th>
            <th scope="col" className={th}>Latest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.firm.key} className="hover:bg-muted">
              <td className={td}>
                <div className="flex items-center gap-2.5">
                  <FirmMark firm={r.firm} />
                  <div className="min-w-0 leading-tight">
                    <button type="button" onClick={() => go({ firm: r.firm.key, tab: null })} className="text-left font-semibold hover:text-primary">{r.firm.name}</button>
                    <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-micro text-muted-foreground">
                      <span>{firmTypeOne(r.firm.type)}</span>
                      <OutLink href={r.firm.home} className="font-medium">{r.firm.homeLabel}</OutLink>
                      {r.firm.cik ? (
                        <button type="button" onClick={() => nav.goView('ideas', 'superinvestors', { fund: r.firm.cik! })} className="font-medium hover:text-foreground">13F holdings →</button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </td>
              <td className={cn(td, 'text-right font-semibold tnum')}>{r.count}</td>
              <td className={td}>
                <div className="flex flex-wrap gap-1">
                  {r.kinds.map((k) => <span key={k} className="rounded bg-accent px-1.5 py-px text-micro font-semibold uppercase tracking-[.04em]">{kindLabel(k)}</span>)}
                </div>
              </td>
              <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>
                {r.first.slice(0, 7) === r.latest.date.slice(0, 7) ? monthLabel(r.latest.date) : `${monthLabel(r.first)} – ${monthLabel(r.latest.date)}`}
              </td>
              <td className={cn(td, 'max-w-[320px]')}>
                <a href={r.latest.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 hover:text-primary">{r.latest.title}</a>
                <span className="text-micro text-muted-foreground">{dateLabel(r.latest.date)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompaniesTable({ rows, go }: { rows: CompanyRow[]; go: Go }) {
  const nav = useNav();
  const n = (v: number, tone: string) => (v ? <span className={cn('font-semibold tnum', tone)}>{v}</span> : <span className="text-muted-foreground">–</span>);
  return (
    <div className="grid gap-3">
      <p className="text-tiny text-muted-foreground">
        Companies come only from documents read for them — fund letters’ own lists of what they bought and sold, and studies of a single company — so this table covers a fraction of the documents listed.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] border-collapse text-13">
          <thead>
            <tr>
              <th scope="col" className={th}>Company</th>
              <th scope="col" className={cn(th, 'text-right')}>Investors</th>
              <th scope="col" className={cn(th, 'text-right')}>Opened</th>
              <th scope="col" className={cn(th, 'text-right')}>Exited</th>
              <th scope="col" className={cn(th, 'text-right')}>Discussed</th>
              <th scope="col" className={th}>In</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} className="hover:bg-muted">
                <td className={td}>
                  <button type="button" onClick={() => nav.goSymbolTab(null, r.ticker)} aria-label={`${r.ticker}, ${r.name}: open the report`}
                    className="flex items-center gap-2.5 text-left hover:text-primary">
                    <InstrumentMark row={{ symbol: r.ticker, kind: 'stock' }} />
                    <span className="leading-tight"><b className="block">{r.ticker}</b><small className="text-micro text-muted-foreground">{r.name}</small></span>
                  </button>
                </td>
                <td className={cn(td, 'text-right font-semibold tnum')}>{r.firms.length}</td>
                <td className={cn(td, 'text-right')}>{n(r.bought, 'text-up')}</td>
                <td className={cn(td, 'text-right')}>{n(r.sold, 'text-down')}</td>
                <td className={cn(td, 'text-right')}>{n(r.discussed, 'text-foreground')}</td>
                <td className={td}>
                  <button type="button" onClick={() => go({ ticker: r.ticker, tab: null })} className="text-left text-tiny font-semibold text-primary hover:underline">
                    {r.firms.map((k) => FIRM_BY_KEY[k].name).join(', ')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==========================================================================
   The page
   ========================================================================== */

export function LettersPage() {
  const nav = useNav();
  const params = useSearchParams();
  const query = React.useMemo(() => parseLetterQuery(params?.toString() || ''), [params]);
  const [open, setOpen] = React.useState(drawerOpen);
  const go: Go = (change) => nav.goView('research', 'letters', mergeLetterQuery(query, change));
  const kind = KINDS.find((k) => k.key === query.kind);
  const tab: TabKey = query.tab || 'documents';

  const items = queryLetters(query);
  const groups = groupLetters(items, query.sort);
  const investors = investorRows(items);
  const companies = companyRows(items);
  const chips = activeLetterChips(query);
  const facets = {
    kind: facetCounts(query, 'kind'), firm: facetCounts(query, 'firm'), who: facetCounts(query, 'who'),
    topic: facetCounts(query, 'topic'), region: facetCounts(query, 'region'),
  };
  const allKinds = Object.values(facets.kind).reduce((a, b) => a + b, 0);
  const inDrawer = (['firm', 'who', 'topic', 'region', 'ticker', 'q'] as const).filter((k) => query[k]).length;
  const tabCount: Record<TabKey, number> = { documents: items.length, investors: investors.length, companies: companies.length };
  const firmsByName = [...FIRMS].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PageFrame id="research-letters">
      <ResearchHero title={kind ? kind.label : 'Letters & Outlooks'} blurb={kind ? kind.blurb : BLURB} />
      <ResearchStrip active="letters" />

      {/* A container, not the viewport: the two rails take ~500px between them and the
          market rail folds, so only the column's own width says whether a side column fits. */}
      <div className="@container grid gap-4 pt-5">
        <div role="tablist" aria-label="Tables" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              onClick={() => go({ tab: t.key === 'documents' ? null : t.key })}
              className={cn('whitespace-nowrap rounded-md px-3.5 py-1.5 text-13 font-semibold text-muted-foreground hover:text-foreground',
                tab === t.key && 'bg-background text-foreground shadow-sm')}>
              {t.label} <span className="tnum font-normal opacity-60">{tabCount[t.key]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Kinds of document" className="flex flex-wrap gap-2">
            <RsPill active={!query.kind} onClick={() => go({ kind: null })}>All <span className="tnum opacity-60">{allKinds}</span></RsPill>
            {KINDS.map((k) => (
              <RsPill key={k.key} active={query.kind === k.key} onClick={() => go({ kind: query.kind === k.key ? null : k.key })}>
                {k.label} <span className="tnum opacity-60">{facets.kind[k.key] || 0}</span>
              </RsPill>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {tab === 'documents' ? (
              <select aria-label="Sort" value={query.sort} onChange={(e) => go({ sort: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-13">
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            ) : null}
            <Button variant="outline" size="sm" aria-expanded={open} aria-controls="letters-filters"
              onClick={() => { drawerOpen = !open; setOpen(!open); }} className={cn(open && 'bg-accent')}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              Filters
              {inDrawer ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{inDrawer}</span> : null}
            </Button>
          </div>
        </div>

        {open ? (
          <div id="letters-filters" className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 rounded-xl border border-border bg-muted p-4">
            {([
              ['Firm', 'firm', firmsByName.map((f) => ({ value: f.key, label: f.name })), 'Any firm'],
              ['Who writes it', 'who', FIRM_TYPES.map((t) => ({ value: t.key, label: t.label })), 'Anyone'],
              ['Topic', 'topic', TOPICS.map((t) => ({ value: t.key, label: t.label })), 'Any topic'],
              ['Region', 'region', REGIONS.map((r) => ({ value: r.key, label: r.label })), 'Any region'],
            ] as [string, FacetKeyName, { value: string; label: string }[], string][]).map(([label, key, options, placeholder]) => (
              <Field key={key} label={label}>
                <select value={(query[key] as string) || ''} onChange={(e) => go({ [key]: e.target.value || null } as Parameters<Go>[0])}
                  className={cn(inputCls, 'font-normal normal-case tracking-normal')}>
                  <option value="">{placeholder}</option>
                  {options.map((o) => {
                    const n = facets[key][o.value] || 0;
                    // A choice that would empty the page stays visible but cannot be picked.
                    return <option key={o.value} value={o.value} disabled={!n && query[key] !== o.value}>{o.label} ({n})</option>;
                  })}
                </select>
              </Field>
            ))}
            <FilterText label="Mentions ticker" value={query.ticker || ''} placeholder="e.g. NFLX" onApply={(v) => go({ ticker: v.toUpperCase() || null })} />
            <FilterText label="Search" value={query.q || ''} placeholder="Title, firm, author or company" onApply={(v) => go({ q: v || null })} />
            <p className="col-span-full text-tiny text-muted-foreground">
              The number beside each choice is how many documents it leaves with your other filters applied. Search covers titles, firms, authors, our summary lines and the companies a letter names — not the documents themselves. Press Enter to apply a text box.
            </p>
          </div>
        ) : null}

        {chips.length ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c.key} type="button" aria-label={`Remove filter ${c.label}`} onClick={() => go({ [c.key]: null } as Parameters<Go>[0])}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-13 hover:bg-accent/70">
                <span>{c.label}</span><i aria-hidden="true" className="not-italic text-muted-foreground">×</i>
              </button>
            ))}
            <button type="button" onClick={() => nav.goView('research', 'letters', mergeLetterQuery({ sort: query.sort, tab: query.tab, kind: query.kind }, {}))}
              className="px-2 text-13 font-semibold text-primary hover:underline">Clear all</button>
          </div>
        ) : null}

        <p className="text-13 text-muted-foreground">
          <b className="text-foreground">{items.length}</b> {items.length === 1 ? 'document' : 'documents'} from <b className="text-foreground">{investors.length}</b> {investors.length === 1 ? 'firm' : 'firms'}
          {chips.length || query.kind ? ' matching these filters' : ''}
          {tab === 'companies' ? <> · <b className="text-foreground">{companies.length}</b> {companies.length === 1 ? 'company' : 'companies'} named</> : null}
        </p>

        {/* The two tables want the whole width; the side cards drop below them. */}
        <div className={cn('grid items-start gap-8', tab === 'documents' && '@min-[1000px]:grid-cols-[minmax(0,1fr)_300px]')}>
          <div className="min-w-0">
            {!items.length ? (
              <div role="status" className="grid justify-items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
                <strong>Nothing on file matches these filters.</strong>
                <p className="text-13 text-muted-foreground">Try dropping the narrowest one.</p>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {chips.length ? <Button variant="outline" size="sm" onClick={() => go({ [chips[chips.length - 1].key]: null } as Parameters<Go>[0])}>Remove “{chips[chips.length - 1].label}”</Button> : null}
                  <Button size="sm" onClick={() => nav.goView('research', 'letters', {})}>Show everything</Button>
                </div>
              </div>
            ) : tab === 'investors' ? (
              <InvestorsTable rows={investors} go={go} />
            ) : tab === 'companies' ? (
              companies.length ? <CompaniesTable rows={companies} go={go} /> : (
                <p role="status" className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-13 text-muted-foreground">
                  None of these documents has been read for the companies it names yet.
                </p>
              )
            ) : groups.map((g) => (
              <section key={g.key} aria-labelledby={`lg-${g.key}`} className="mb-4">
                <h2 id={`lg-${g.key}`} className="border-b border-border py-2 text-micro font-semibold uppercase tracking-[.1em] text-muted-foreground">
                  {g.label}
                </h2>
                {g.letters.map((l) => <LetterRow key={l.id} l={l} go={go} />)}
              </section>
            ))}
          </div>
          <aside className={cn('grid items-start gap-4',
            tab === 'documents' ? '@min-[640px]:@max-[999px]:grid-cols-2' : '@min-[640px]:grid-cols-2')}>
            <Agreement go={go} />
            {tab === 'investors' ? null : <MostActive rows={investors} go={go} />}
            <Method />
          </aside>
        </div>
      </div>
    </PageFrame>
  );
}
