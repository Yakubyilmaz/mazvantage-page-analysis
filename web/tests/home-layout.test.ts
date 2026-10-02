import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, isDefaultLayout, moveBlock, normaliseLayout, toggleBlock } from '@/lib/home-layout';

const ids = (l: { id: string }[]) => l.map((e) => e.id);

describe('a stored layout', () => {
  it('reads nothing, or garbage, as the default', () => {
    expect(normaliseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normaliseLayout('nonsense')).toEqual(DEFAULT_LAYOUT);
  });
  it('keeps the reader’s order and switches, and drops blocks that no longer exist', () => {
    const l = normaliseLayout([{ id: 'economy', on: true }, { id: 'banner', on: false }, { id: 'gone', on: true }, { id: 'economy', on: false }]);
    expect(l[0]).toEqual({ id: 'economy', on: true });
    expect(ids(l).indexOf('economy')).toBeLessThan(ids(l).indexOf('banner'));
    expect(l.find((e) => e.id === 'banner')!.on).toBe(false);
    expect(ids(l)).not.toContain('gone');
    expect(new Set(ids(l)).size).toBe(DEFAULT_LAYOUT.length);
  });
  it('puts a block added in a later release after the block it follows by default', () => {
    // A layout saved before `watchlist` existed: banner first, then the rest.
    const old = DEFAULT_LAYOUT.filter((e) => e.id !== 'watchlist');
    const l = normaliseLayout(old);
    expect(ids(l).indexOf('watchlist')).toBe(ids(l).indexOf('banner') + 1);
  });
});

describe('editing', () => {
  it('moves a block one place, and not past either end', () => {
    const l = moveBlock(DEFAULT_LAYOUT, 'stories', -1);
    expect(ids(l).indexOf('stories')).toBe(ids(DEFAULT_LAYOUT).indexOf('stories') - 1);
    expect(moveBlock(DEFAULT_LAYOUT, DEFAULT_LAYOUT[0].id, -1)).toBe(DEFAULT_LAYOUT);
  });
  it('knows when an edit has been undone', () => {
    const off = toggleBlock(DEFAULT_LAYOUT, 'etfs');
    expect(isDefaultLayout(off)).toBe(false);
    expect(isDefaultLayout(toggleBlock(off, 'etfs'))).toBe(true);
  });
});
