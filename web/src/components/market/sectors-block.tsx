'use client';

/* ==========================================================================
   The Sectors block

   Port of the legacy `sectorsblock.js`: a table of sectors on the left, a
   squarified treemap on the right, and clicking a sector swaps the treemap
   for the industries inside it. Three requests for the whole thing — see
   `loadSectorBlock` in `lib/sectors.ts` for what each one supplies and why
   the year comes from the funds rather than the sector feed.

   Every way out is optional, because the block sits on two pages that want
   different ones — a title or a button that looks like a link and goes nowhere
   is worse than one that plainly does not, so each appears only with its
   callback:

     onOpen        makes the heading a link
     onAll         a "Sectors & industries" button above the map while it shows
                   every sector — the way to the full breakdown
     onSectorPage  an "Open <sector>" button once one is chosen; the row and
                   tile clicks belong to the drill-down
     onIndustry    what an industry tile opens — its own page
   ========================================================================== */

import * as React from 'react';
import { isNum, pct } from '@/lib/format';
import { loadSectorBlock, type BlockData, type BlockSector } from '@/lib/sectors';
import { squarify } from '@/lib/treemap';
import { EmptyState, Chevron } from '@/components/market/market-ui';
import { CanvasSection } from '@/components/market/canvas';
import { HeatLegend, heatTone } from '@/components/report/ui';
import { useHasKey } from '@/components/pages/page-parts';
import { cn } from '@/lib/cn';

/** Industries drawn inside one sector; the tail is grouped rather than dropped. */
const MAX_TILES = 14;
/** A tile below this share of the parent is unreadable at any sensible size. */
const MIN_SHARE = 0.004;
const ALL = '__all__';

/* The treemap's own palette: solid tiles with white type, on the same fixed
   thresholds `heatTone` returns, so a quiet day looks quiet here too. */
const TILE_BG: Record<string, string> = {
  flat: 'var(--muted-foreground)',
  na: 'var(--accent)',
  'up-1': 'color-mix(in srgb, var(--up) 45%, #0b6b5e)',
  'up-2': 'color-mix(in srgb, var(--up) 70%, #0b6b5e)',
  'up-3': 'var(--up)',
  'up-4': 'color-mix(in srgb, var(--up) 75%, #000)',
  'down-1': 'color-mix(in srgb, var(--down) 55%, #8c1d33)',
  'down-2': 'color-mix(in srgb, var(--down) 75%, #8c1d33)',
  'down-3': 'var(--down)',
  'down-4': 'color-mix(in srgb, var(--down) 70%, #000)',
};
const tileBg = (change: number | null | undefined) => TILE_BG[heatTone(change)];

interface Tile { label: string; weight: number; change: number | null; sector?: string; industry?: string; rest?: boolean }

/** Tiles for the map: the sectors, or one sector's industries. */
function tilesFor(sectors: BlockSector[], selected: string): Tile[] {
  if (selected === ALL) return sectors.map((s) => ({ label: s.name, weight: s.weight, change: s.change, sector: s.name }));
  const sector = sectors.find((s) => s.name === selected);
  if (!sector) return [];
  /* Below a fraction of a per cent a tile cannot hold a label, so the tail is
     pooled into one rather than drawn as a row of unreadable slivers. */
  const big = sector.industries.filter((i) => i.weight / 100 >= MIN_SHARE).slice(0, MAX_TILES);
  const rest = sector.industries.filter((i) => !big.includes(i));
  const tail = rest.reduce((a, i) => a + i.weight, 0);
  return [
    ...big.map((i) => ({ label: i.name, weight: i.weight, change: i.change, industry: i.name })),
    ...(tail > 0 ? [{ label: `${rest.length} smaller industries`, weight: tail, change: null, rest: true }] : []),
  ];
}

function Treemap({ tiles, onPick, linksIndustries }: { tiles: Tile[]; onPick: (t: Tile) => void; linksIndustries: boolean }) {
  const live = tiles.filter((r) => r.weight > 0).sort((a, b) => b.weight - a.weight);
  if (!live.length) return <EmptyState status="unavailable" message="Nothing to map here." compact />;
  const total = live.reduce((a, r) => a + r.weight, 0);
  const placed = squarify(live.map((r) => ({ ...r, value: r.weight / total })));

  return (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden rounded-[10px] bg-muted max-[1100px]:aspect-[16/10] max-[1100px]:min-h-0 max-[700px]:aspect-[4/3]">
      {placed.map((t) => {
        const size = t.value < 0.035 ? 'tiny' : t.value < 0.09 ? 'small' : 'big';
        const na = heatTone(t.change) === 'na';
        const title = `${t.label} · ${pct(t.weight, { already: true })} of market cap`
          + `${isNum(t.change) ? ` · ${pct(t.change, { already: true, sign: true })} today` : ''}`
          + `${t.industry && linksIndustries ? ' · opens the industry page' : ''}`;
        const clickable = !t.rest && (t.sector || (t.industry && linksIndustries));
        const body = (
          <>
            <span className={cn('max-w-full truncate font-[650] leading-[1.15]', size === 'big' ? 'text-[15px]' : size === 'small' ? 'text-micro' : 'text-[9px]')}>{t.label}</span>
            <span className={cn('font-semibold tnum', size === 'big' ? 'text-13' : size === 'small' ? 'text-[10px]' : 'text-[9px]')}>
              {isNum(t.change) ? pct(t.change, { already: true, sign: true }) : 'n/a'}
            </span>
          </>
        );
        const style = { left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%`, background: tileBg(t.change) };
        const cls = cn('absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden border border-background text-center',
          size === 'tiny' ? 'p-0.5' : 'p-1.5', na ? 'text-muted-foreground' : 'text-white');
        return clickable ? (
          <button key={t.label} type="button" title={title} style={style} onClick={() => onPick(t)}
            className={cn(cls, 'hover:z-[2] hover:outline-2 hover:-outline-offset-2 hover:outline-foreground')}>{body}</button>
        ) : (
          <div key={t.label} title={title} style={style} className={cls}>{body}</div>
        );
      })}
    </div>
  );
}

export function SectorsBlock({ onOpen, onAll, onIndustry, onSectorPage, title = 'Sectors', id = 'market-sectors', first }: {
  onOpen?: () => void;
  onAll?: () => void;
  onIndustry?: (industry: string, sector: string) => void;
  onSectorPage?: (sector: string) => void;
  title?: string;
  id?: string;
  first?: boolean;
}) {
  const has = useHasKey();
  const [data, setData] = React.useState<BlockData | null>(null);
  const [selected, setSelected] = React.useState(ALL);

  React.useEffect(() => {
    setData(null);
    if (!has) { setData({ status: 'skipped' }); return; }
    let live = true;
    loadSectorBlock()
      .then((r) => { if (live) setData(r); })
      .catch((e) => { if (live) setData({ status: 'error', message: String(e?.message || e) }); });
    return () => { live = false; };
  }, [has]);

  const wrap = (children: React.ReactNode) => (
    <CanvasSection id={id} title={title} mark="◳" onTitle={onOpen} first={first}>{children}</CanvasSection>
  );

  if (!data) return wrap(<EmptyState status="loading" compact />);
  if (data.status !== 'ok' || !('sectors' in data)) {
    return wrap(
      <EmptyState status={data.status} compact message={'message' in data && data.message ? data.message
        : data.status === 'skipped' ? 'The sector breakdown is unavailable right now.'
          : 'No sector breakdown came back for this market.'} />,
    );
  }

  const row = (s: { name: string; weight: number; change: number | null; ytd: number | null }, key: string) => {
    const on = selected === key;
    return (
      <button key={key} type="button" aria-pressed={on} onClick={() => setSelected(key)}
        className={cn('grid grid-cols-[minmax(0,1fr)_minmax(40px,90px)_58px_62px] items-center gap-2.5 border-b border-border px-2 py-[9px] text-left last:border-b-0 hover:bg-accent max-[700px]:grid-cols-[minmax(0,1fr)_54px_58px]',
          on && 'bg-primary/10')}>
        <span className={cn('truncate text-13 font-medium', on && 'font-[650]')}>{s.name}</span>
        <span aria-hidden="true" className="block h-[7px] overflow-hidden rounded-full bg-muted max-[700px]:hidden">
          <i className={cn('block h-full rounded-full', on ? 'bg-muted-foreground' : 'bg-primary')} style={{ width: `${Math.max(1, Math.min(100, s.weight))}%` }} />
        </span>
        <span className="text-right text-tiny tnum">{pct(s.weight, { already: true, dp: 2 })}</span>
        <span title={isNum(s.change) ? `Today ${pct(s.change, { already: true, sign: true })}` : undefined}
          className={cn('text-right text-tiny tnum', isNum(s.ytd) && (s.ytd >= 0 ? 'text-up' : 'text-down'))}>
          {isNum(s.ytd) ? pct(s.ytd, { already: true, sign: true }) : 'n/a'}
        </span>
      </button>
    );
  };

  const tiles = tilesFor(data.sectors, selected);
  const smallButton = 'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-tiny text-primary hover:bg-accent';

  return wrap(
    <>
      <div className="grid grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-stretch gap-[18px] max-[1100px]:grid-cols-1">
        <div className="grid min-w-0 content-start gap-3 rounded-xl border border-border px-[18px] py-4">
          <p className="text-13 font-[650]">Select a sector for a visual breakdown</p>
          <div className="grid">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(40px,90px)_58px_62px] gap-2.5 border-b border-border px-2 pb-2 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground max-[700px]:grid-cols-[minmax(0,1fr)_54px_58px]">
              <span>Sector</span>
              <span className="col-span-2 text-right max-[700px]:col-span-1">Market weight</span>
              <span className="text-right" title="Year to date, from the sector’s tracking ETF">YTD</span>
            </div>
            {row({ name: 'All sectors', weight: 100, change: data.change, ytd: data.ytd }, ALL)}
            {data.sectors.map((s) => row(s, s.name))}
          </div>
        </div>
        <div className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2.5 rounded-xl border border-border px-[18px] py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-13 font-[650]">{selected === ALL ? 'All sectors' : selected}</strong>
            <span className="min-w-0 flex-[1_1_180px] text-micro text-muted-foreground">Sized by market weight, coloured by today</span>
            <span className="ml-auto flex items-baseline gap-1">
              {selected === ALL && onAll ? (
                <button type="button" className={smallButton} title="Every sector and the industries inside it" onClick={onAll}>Sectors &amp; industries<Chevron /></button>
              ) : null}
              {selected !== ALL && onSectorPage ? (
                <button type="button" className={smallButton} onClick={() => onSectorPage(selected)}>Open {selected}<Chevron /></button>
              ) : null}
              {selected !== ALL ? <button type="button" className={smallButton} onClick={() => setSelected(ALL)}>‹ All sectors</button> : null}
            </span>
          </div>
          <Treemap tiles={tiles} linksIndustries={!!onIndustry} onPick={(t) => {
            if (t.rest) return;
            if (t.sector) { setSelected(t.sector); return; }
            if (t.industry) onIndustry?.(t.industry, selected);
          }} />
          <HeatLegend bg={tileBg} className="justify-end" />
        </div>
      </div>
    </>,
  );
}
