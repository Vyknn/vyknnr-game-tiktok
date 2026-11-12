import { describe, it, expect } from 'vitest';
import { isoToScreen, biomePalette, shade } from '@/game/iso';

const rgb = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

describe('isoToScreen', () => {
  it('projects tile coordinates to screen space', () => {
    expect(isoToScreen(0, 0, 0, 64, 32)).toEqual({ sx: 0, sy: 0 });
    expect(isoToScreen(1, 0, 0, 64, 32)).toEqual({ sx: 32, sy: 16 });
    expect(isoToScreen(0, 1, 10, 64, 32)).toEqual({ sx: -32, sy: 6 });
  });
});

describe('biomePalette', () => {
  it('darkens each wrap of the biome cycle', () => {
    const a = rgb(biomePalette('grass', 0).top);
    const b = rgb(biomePalette('grass', 1).top);
    a.forEach((c, i) => expect(b[i]).toBeLessThanOrEqual(c));
    expect(b.reduce((s, c) => s + c)).toBeLessThan(a.reduce((s, c) => s + c));
  });
  it('never goes below 40% brightness', () => {
    const base = rgb(biomePalette('dirt', 0).top);
    const deep = rgb(biomePalette('dirt', 50).top);
    deep.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(Math.floor(base[i] * 0.4)));
  });
  it('shades side faces darker than the top', () => {
    const p = biomePalette('stone', 0);
    expect(rgb(p.left).reduce((s, c) => s + c)).toBeLessThan(rgb(p.top).reduce((s, c) => s + c));
    expect(rgb(p.right).reduce((s, c) => s + c)).toBeLessThan(rgb(p.left).reduce((s, c) => s + c));
  });
  it('shade scales channels', () => {
    expect(shade(0xff8040, 0.5)).toBe(0x804020);
  });
});
