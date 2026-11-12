import type Phaser from 'phaser';
import { GAME } from '@/config/game';
import type { Rarity } from '@/shared/types';

/** Pixel scale for all generated art. */
export const PX = 4;

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xb0bec5, rare: 0x42a5f5, epic: 0xab47bc, legendary: 0xffca28,
};

/**
 * 8 original "digger" characters: little helmeted moles/blobs. Each = body color, helmet style, eye style.
 * Drawn as 16×20 pixel sprites from string maps so they stay crisp at PX scale.
 */
const BODY = [0xffb74d, 0x4fc3f7, 0xf06292, 0x9ccc65, 0xba68c8, 0xffd54f, 0x4db6ac, 0xe57373];
const HELMET = [0xfdd835, 0x8d6e63, 0x90a4ae, 0xef5350, 0x26a69a, 0x5c6bc0, 0xff7043, 0xeceff1];

// legend: . empty, H helmet, L lamp, B body, D body dark, E eye, W eye white, M mouth, P pick handle, S pick steel
const BASE_SPRITE = [
  '................',
  '.....HHHHHH.....',
  '....HHHLLHHH....',
  '...HHHHLLHHHH...',
  '...HHHHHHHHHH...',
  '..BBBBBBBBBBBB..',
  '..BBWWBBBBWWBB..',
  '..BBWEBBBBWEBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBMMBBBBB..',
  '...BBBBBBBBBB...',
  '...DBBBBBBBBD...',
  '..DDBBBBBBBBDD..',
  '..DDBBBBBBBBDD..',
  '...DBBBBBBBBD...',
  '....BBBBBBBB....',
  '....DD....DD....',
  '....DD....DD....',
  '................',
  '................',
];

function drawMap(
  g: Phaser.GameObjects.Graphics, rows: string[], colors: Record<string, number>,
): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const c = colors[ch];
      if (c === undefined) return;
      g.fillStyle(c, 1);
      g.fillRect(x * PX, y * PX, PX, PX);
    });
  });
}

function avatarRows(i: number): string[] {
  const rows = [...BASE_SPRITE];
  // vary helmet shape: even = round dome, odd = flat cap with brim
  if (i % 2 === 1) {
    rows[1] = '................';
    rows[4] = '..HHHHHHHHHHHH..';
  }
  // vary eyes: every third avatar gets sleepy eyes
  if (i % 3 === 2) {
    rows[6] = '..BBBBBBBBBBBB..';
    rows[7] = '..BBEEBBBBEEBB..';
  }
  // ears for i >= 4
  if (i >= 4) {
    rows[5] = '.DBBBBBBBBBBBBD.';
  }
  return rows;
}

const darken = (c: number, f: number) =>
  (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  for (let i = 0; i < GAME.AVATAR_COUNT; i++) {
    g.clear();
    drawMap(g, avatarRows(i), {
      H: HELMET[i], L: 0xfff59d, B: BODY[i], D: darken(BODY[i], 0.75),
      E: 0x212121, W: 0xffffff, M: 0x5d4037,
    });
    g.generateTexture(`avatar${i}`, 16 * PX, 20 * PX);
  }

  // pickaxe (held tool)
  g.clear();
  drawMap(g, [
    '.SSSSS.',
    'SS.P.SS',
    'S..P..S',
    '...P...',
    '...P...',
    '...P...',
  ], { S: 0xcfd8dc, P: 0x8d6e63 });
  g.generateTexture('pick', 7 * PX, 6 * PX);

  // crown
  g.clear();
  drawMap(g, [
    'Y..Y..Y',
    'YY.Y.YY',
    'YYYYYYY',
    'YRYYYRY',
    'YYYYYYY',
  ], { Y: 0xffca28, R: 0xe53935 });
  g.generateTexture('crown', 7 * PX, 5 * PX);

  // dirt chunk (tinted per biome at runtime)
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, PX * 2, PX * 2);
  g.generateTexture('chunk', PX * 2, PX * 2);

  // spark (fireworks / glow)
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, PX, PX);
  g.generateTexture('spark', PX, PX);

  // artifact icons: one shape per rarity (gem-like), white so they can be tinted
  const icons: Record<Rarity, string[]> = {
    common: ['..WW..', '.WWWW.', 'WWWWWW', 'WWWWWW', '.WWWW.', '..WW..'],
    rare: ['..W...', '.WWW..', 'WWWWW.', '.WWWWW', '..WWW.', '...W..'],
    epic: ['W....W', 'WW..WW', 'WWWWWW', 'WWWWWW', '.WWWW.', '..WW..'],
    legendary: ['..WW..', 'W.WW.W', 'WWWWWW', '.WWWW.', 'WWWWWW', 'W....W'],
  };
  for (const [rarity, rows] of Object.entries(icons)) {
    g.clear();
    drawMap(g, rows, { W: 0xffffff });
    g.generateTexture(`icon-${rarity}`, 6 * PX, 6 * PX);
  }
  g.destroy();
}
