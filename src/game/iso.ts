import type { Biome } from '@/shared/types';

/** Standard 2:1 isometric projection. z lifts the point up the screen. */
export function isoToScreen(x: number, y: number, z: number, tileW: number, tileH: number) {
  return { sx: (x - y) * (tileW / 2), sy: (x + y) * (tileH / 2) - z };
}

export function shade(color: number, f: number): number {
  const ch = (s: number) => Math.min(255, Math.round(((color >> s) & 255) * f));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

type Base = { top: number; dirt: number; accent: number };
const BASE: Record<Biome, Base> = {
  grass: { top: 0x7cc35a, dirt: 0x8b5a2b, accent: 0x4e8f3a },
  dirt: { top: 0xd9a95f, dirt: 0x9c6b35, accent: 0xb5813f },
  stone: { top: 0xa7a39b, dirt: 0x7d7a73, accent: 0x8c877e },
  coal: { top: 0x55514e, dirt: 0x2e2b29, accent: 0x3b3735 },
  crystal: { top: 0x8fd3e8, dirt: 0x5fa8c8, accent: 0xc3a6f0 },
  marble: { top: 0xe6dfd6, dirt: 0xbdb3a6, accent: 0xa99c8d },
  magma: { top: 0xb8452a, dirt: 0xff7a2e, accent: 0x5a1d12 },
};

export type Palette = { top: number; left: number; right: number; dirt: number; accent: number };

/** Each full wrap of the biome cycle darkens 12%, floored at 40%. */
export function biomePalette(biome: Biome, cycle: number): Palette {
  const f = Math.max(0.4, 1 - 0.12 * cycle);
  const b = BASE[biome];
  const top = shade(b.top, f);
  return {
    top,
    left: shade(top, 0.78),
    right: shade(top, 0.6),
    dirt: shade(b.dirt, f),
    accent: shade(b.accent, f),
  };
}
