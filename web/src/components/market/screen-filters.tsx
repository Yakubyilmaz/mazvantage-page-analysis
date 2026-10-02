'use client';

/* ==========================================================================
   Maz Vantage — the Stock Screener's company filters: the picker and the chips

   The picker is a multi-select over every metric in `screener-filters.ts`:
   our scores, Wall Street's ratings, then the Statistics & Metrics tab's
   groups in the tab's own order. Ticking several and applying adds a chip
   for each; a chip holds no number until one is typed, and a chip with no
   number filters nothing.
   ========================================================================== */

import * as React from 'react';
import {
  OPS, filterText, isActive, metricGroups, parseInput, screenMetric, toInput, unitOf,
  type FilterOp, type InputKind, type ScreenFilter, type ScreenMetric,
} from '@/lib/screener-filters';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Popover, PopoverContent, PopoverTrigger, ScrollArea } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/* ---------- the picker ---------------------------------------------------- */

export function MetricPicker({ selected, onApply }: { selected: string[]; onApply: (ids: string[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Set<string>>(new Set(selected));
  const [q, setQ] = React.useState('');
  const groups = React.useMemo(() => metricGroups(), []);
  const total = React.useMemo(() => groups.reduce((n, g) => n + g.metrics.length, 0), [groups]);

  // The draft starts from the chips on screen every time it opens.
  const onOpenChange = (next: boolean) => {
    if (next) { setDraft(new Set(selected)); setQ(''); }
    setOpen(next);
  };
  const toggle = (id: string, on: boolean) => setDraft((d) => {
    const n = new Set(d);
    if (on) n.add(id); else n.delete(id);
    return n;
  });

  const query = q.trim().toLowerCase();
  const shown = groups
    .map((g) => ({ ...g, metrics: g.metrics.filter((m) => !query || m.label.toLowerCase().includes(query) || g.name.toLowerCase().includes(query)) }))
    .filter((g) => g.metrics.length);
  const added = [...draft].filter((id) => !selected.includes(id)).length;
  const removed = selected.filter((id) => !draft.has(id)).length;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" aria-haspopup="dialog"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-primary/60 px-3 text-13 font-semibold text-primary hover:bg-primary/5">
          + Add filters
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" role="dialog" aria-label="Choose metrics to filter on"
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[380px] flex-col p-0">
        <div className="border-b border-border p-2">
          <Input autoFocus type="search" placeholder={`Search ${total} metrics…`} aria-label="Search metrics" value={q}
            onChange={(e) => setQ(e.target.value)} className="h-9" />
        </div>
        {/* Shrinks to the room below the button, so the footer is never pushed off screen. */}
        <ScrollArea className="h-[380px] min-h-0 shrink">
          <div className="p-1">
            {shown.length ? shown.map((g) => (
              <section key={g.name} aria-label={g.name}>
                <h4 className="sticky top-0 z-[1] flex items-baseline justify-between bg-popover px-2 pb-1 pt-2 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">
                  <span>{g.name}</span><span className="font-normal normal-case tracking-normal">{g.metrics.length}</span>
                </h4>
                {g.metrics.map((m) => {
                  const on = draft.has(m.id);
                  return (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-13 hover:bg-accent">
                      <Checkbox checked={on} onCheckedChange={(v) => toggle(m.id, v === true)} aria-label={m.label} />
                      <span className="min-w-0 flex-1 truncate">{m.label}</span>
                      {m.basis ? <span className="shrink-0 text-micro text-muted-foreground">{m.basis}</span> : null}
                    </label>
                  );
                })}
              </section>
            )) : <p className="px-3 py-8 text-center text-13 text-muted-foreground">No metric matches that.</p>}
          </div>
        </ScrollArea>
        <div className="flex items-center justify-between gap-2 border-t border-border p-2">
          <span className="text-tiny text-muted-foreground" aria-live="polite">{draft.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={!draft.size} onClick={() => setDraft(new Set())}>Clear</Button>
            <Button size="sm" variant="default" disabled={!added && !removed} onClick={() => { onApply([...draft]); setOpen(false); }}>
              {added ? `Add ${added} filter${added === 1 ? '' : 's'}` : 'Apply'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- one chip ------------------------------------------------------ */

/** A number box that commits on blur or Enter, so a half-typed "1." never filters. */
function NumBox({ kind, value, label, onCommit }: { kind: InputKind; value: number | null | undefined; label: string; onCommit: (v: number | null) => void }) {
  const [text, setText] = React.useState(toInput(kind, value));
  React.useEffect(() => { setText(toInput(kind, value)); }, [kind, value]);
  const commit = () => onCommit(parseInput(kind, text));
  return (
    <Input inputMode="decimal" placeholder={kind === 'money' || kind === 'count' ? 'e.g. 2b' : 'any'} aria-label={label}
      value={text} className="h-9 w-24 tnum" onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
  );
}

const selCls = 'h-9 rounded-md border border-border bg-background px-2 text-13';

/** "12 of 150 tested have no figure": said on the chip, because an empty result otherwise has no visible cause. */
export interface Coverage { tested: number; missing: number }

export function FilterChip({ filter, onChange, onRemove, coverage }: {
  filter: ScreenFilter; onChange: (f: ScreenFilter) => void; onRemove: () => void; coverage?: Coverage;
}) {
  const m = screenMetric(filter.metric) as ScreenMetric;
  const [open, setOpen] = React.useState(false);
  if (!m) return null;
  const on = isActive(filter);
  const unit = unitOf(m.kind);
  const lo = Array.isArray(filter.value) ? filter.value[0] : filter.value;
  const hi = Array.isArray(filter.value) ? filter.value[1] : null;
  const setOp = (op: FilterOp) => onChange({ ...filter, op, value: op === 'between' ? [lo ?? null, null] : lo ?? null });
  const blind = coverage && coverage.tested > 0 && coverage.missing === coverage.tested;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-haspopup="dialog" title={blind ? 'None of the companies tested had this figure' : undefined}
          className={cn('inline-flex h-8 max-w-[320px] items-center gap-1.5 rounded-md border px-3 text-13 hover:bg-accent',
            on ? 'border-primary text-primary' : 'border-dashed border-border text-muted-foreground', blind && 'border-warning text-warning')}>
          <span className="truncate">{filterText(filter, m)}</span>
          {blind ? <span aria-hidden="true">⚠</span> : null}
          <span aria-hidden="true" className="text-muted-foreground">⌄</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-3" role="dialog" aria-label={`${m.label} filter`}>
        <div className="grid gap-3">
          <div>
            <strong className="text-13">{m.label}</strong>
            <p className="text-micro text-muted-foreground">{m.group}{m.basis ? ` · ${m.basis}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Comparison" value={Array.isArray(filter.value) ? 'between' : filter.op} className={cn(selCls, 'w-28')}
              onChange={(e) => setOp(e.target.value as FilterOp)}>
              {OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <NumBox kind={m.kind} label={`${m.label} value`} value={lo}
              onCommit={(v) => onChange({ ...filter, value: Array.isArray(filter.value) ? [v, hi] : v })} />
            {Array.isArray(filter.value) ? (
              <>
                <span className="text-tiny text-muted-foreground">and</span>
                <NumBox kind={m.kind} label={`${m.label} upper value`} value={hi} onCommit={(v) => onChange({ ...filter, value: [lo ?? null, v] })} />
              </>
            ) : null}
            {unit ? <i className="text-13 not-italic text-muted-foreground">{unit}</i> : null}
          </div>
          {m.hint ? <p className="text-tiny leading-relaxed text-muted-foreground">{m.hint}</p> : null}
          {m.kind === 'mult' && filter.op === 'lte' && !Array.isArray(filter.value) ? (
            <p className="text-tiny text-muted-foreground">A negative multiple is a loss or negative equity, so it never passes “at most”.</p>
          ) : null}
          {coverage && coverage.tested ? (
            <p className={cn('text-tiny', coverage.missing ? 'text-warning' : 'text-muted-foreground')}>
              {coverage.missing
                ? `${coverage.missing} of ${coverage.tested} companies tested have no figure for this, and fail it.`
                : `Every one of the ${coverage.tested} companies tested has a figure for this.`}
            </p>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <button type="button" onClick={() => { setOpen(false); onRemove(); }} className="text-13 text-down hover:underline">Remove</button>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A new chip for a metric: "at least", no number yet. */
export const newFilter = (metric: string): ScreenFilter => ({ id: `new-${metric}-${Date.now()}`, metric, op: 'gte', value: null });
