import * as React from 'react';
import { cn } from '@/lib/cn';
import type { NavIcon } from '@/lib/nav';

/* Rail icons are drawn as strokes rather than filled paths, which is what
   keeps them legible at 20px on black — a filled glyph turns to mud. */
const STROKE: Record<NavIcon, React.ReactNode> = {
  dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  trending: (<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>),
  search: (<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>),
  file: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>),
  bulb: (<><path d="M9 18h6" /><path d="M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A5.06 5.06 0 0 1 8.91 14" /></>),
  layers: (<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>),
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></>),
  bars: (<><line x1="6" y1="20" x2="6" y2="13" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="9" /></>),
  news: (<><path d="M4 5h11v15H5a1 1 0 0 1-1-1z" /><path d="M15 9h4v9a2 2 0 0 1-2 2h-2" /><line x1="7" y1="9" x2="12" y2="9" /><line x1="7" y1="13" x2="12" y2="13" /><line x1="7" y1="16" x2="10" y2="16" /></>),
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>),
  basket: (<><path d="M3 9h18l-1.6 9.2A2 2 0 0 1 17.4 20H6.6a2 2 0 0 1-2-1.8z" /><path d="M8 9 10.5 4" /><path d="M16 9 13.5 4" /><line x1="10" y1="13" x2="10" y2="16" /><line x1="14" y1="13" x2="14" y2="16" /></>),
  star: (<polygon points="12 3 14.9 9.2 21.5 10 16.7 14.6 18 21.1 12 17.9 6 21.1 7.3 14.6 2.5 10 9.1 9.2" />),
  shield: (<path d="M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6z" />),
  mic: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="21" /><line x1="8" y1="21" x2="16" y2="21" /></>),
};

export function StrokeIcon({ kind, className }: { kind: NavIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"
      className={cn('size-5 flex-none fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]', className)}>
      {STROKE[kind]}
    </svg>
  );
}

/* The filled glyphs of the utility bar and the report head. */
const FILLED = {
  search: 'M10 2a8 8 0 105.293 14.293l4.707 4.707 1.414-1.414-4.707-4.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z',
  gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0 6a2 2 0 110-4 2 2 0 010 4zm8.94-2a7.94 7.94 0 00-.14-1.46l2.03-1.58-2-3.46-2.4.96a8.1 8.1 0 00-2.53-1.46L15.5 2h-4l-.4 2.54a8.1 8.1 0 00-2.53 1.46l-2.4-.96-2 3.46L6.2 10.1a8.03 8.03 0 000 3.8l-2.03 1.58 2 3.46 2.4-.96c.76.62 1.62 1.12 2.53 1.46l.4 2.56h4l.4-2.56a8.1 8.1 0 002.53-1.46l2.4.96 2-3.46-2.03-1.58c.09-.48.14-.97.14-1.46z',
  sun: 'M12 17a5 5 0 110-10 5 5 0 010 10zm0-14a1 1 0 011 1v2a1 1 0 11-2 0V4a1 1 0 011-1zm0 16a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zM3 12a1 1 0 011-1h2a1 1 0 110 2H4a1 1 0 01-1-1zm15 0a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zM5.6 5.6a1 1 0 011.4 0l1.5 1.5a1 1 0 11-1.4 1.4L5.6 7a1 1 0 010-1.4zm9.9 9.9a1 1 0 011.4 0l1.5 1.5a1 1 0 01-1.4 1.4l-1.5-1.5a1 1 0 010-1.4zm3-9.9a1 1 0 010 1.4L17 8.5a1 1 0 11-1.4-1.4l1.5-1.5a1 1 0 011.4 0zM8.5 17l-1.5 1.5a1 1 0 01-1.4-1.4L7 15.6A1 1 0 118.5 17z',
  print: 'M19 8H5a3 3 0 00-3 3v6h4v4h12v-4h4v-6a3 3 0 00-3-3zm-3 11H8v-5h8v5zm3-8a1 1 0 110-2 1 1 0 010 2zM18 3H6v4h12V3z',
  refresh: 'M17.65 6.35A8 8 0 106 18.35l1.42-1.42A6 6 0 1112 18a6 6 0 01-4.24-1.76l2.83-2.83H3.5v7.07l2.84-2.83A8 8 0 0020 12h-2a6 6 0 01-6 6V4l5.65 2.35z',
} as const;

export function FilledIcon({ name, className }: { name: keyof typeof FILLED; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-[17px] fill-current', className)}>
      <path d={FILLED[name]} />
    </svg>
  );
}

/* The pass / fail / not-assessed marks of the ratio tables. */
const TICK = {
  pass: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12ZM5.70711 13.7071L9.29289 17.2929C9.68342 17.6834 10.3166 17.6834 10.7071 17.2929L18.2929 9.70711C18.6834 9.31658 18.6834 8.68342 18.2929 8.29289L17.7071 7.70711C17.3166 7.31658 16.6834 7.31658 16.2929 7.70711L10 14L7.70711 11.7071C7.31658 11.3166 6.68342 11.3166 6.29289 11.7071L5.70711 12.2929C5.31658 12.6834 5.31658 13.3166 5.70711 13.7071Z',
  fail: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12ZM12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L6.70711 7.29289C6.31658 7.68342 6.31658 8.31658 6.70711 8.70711L10 12L6.70711 15.2929C6.31658 15.6834 6.31658 16.3166 6.70711 16.7071L7.29289 17.2929C7.68342 17.6834 8.31658 17.6834 8.70711 17.2929L12 14L15.2929 17.2929C15.6834 17.6834 16.3166 17.6834 16.7071 17.2929L17.2929 16.7071C17.6834 16.3166 17.6834 15.6834 17.2929 15.2929L14 12L17.2929 8.70711C17.6834 8.31658 17.6834 7.68342 17.2929 7.29289L16.7071 6.70711C16.3166 6.31658 15.6834 6.31658 15.2929 6.70711L12 10Z',
  na: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12ZM7 11H17C17.5523 11 18 11.4477 18 12V12C18 12.5523 17.5523 13 17 13H7C6.44772 13 6 12.5523 6 12V12C6 11.4477 6.44772 11 7 11Z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
} as const;

export type TickKind = keyof typeof TICK;

export function TickIcon({ kind, className, title }: { kind: TickKind | string; className?: string; title?: string }) {
  const d = TICK[(kind as TickKind)] || TICK.info;
  return (
    <svg viewBox="0 0 24 24" className={cn('size-4 flex-none fill-current', className)}
      role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path d={d} fillRule="evenodd" />
    </svg>
  );
}
