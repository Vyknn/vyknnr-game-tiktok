import { GAME, BIOMES } from '@/config/game';
import type { Biome } from '@/shared/types';

const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function likeToDigs(count: number): number {
  return Math.min(GAME.MAX_LIKES_PER_EVENT, nonNeg(count));
}

export function giftToDigs(diamonds: number, repeat: number): number {
  const d = nonNeg(diamonds) * nonNeg(repeat) * GAME.GIFT_MULTIPLIER; // may overflow to Infinity
  return d > GAME.MAX_DIGS_PER_GIFT ? GAME.MAX_DIGS_PER_GIFT : d;
}

/** Artifact rolls for one gift: ceil(sqrt(digs)), capped, so whales can't max bonus in one gift. */
export function giftRolls(digs: number): number {
  if (!(digs > 0)) return 0;
  return Math.min(GAME.GIFT_ROLL_CAP, Math.ceil(Math.sqrt(digs)));
}

export function layerMaxHp(layer: number): number {
  return Math.round(GAME.BASE_HP * GAME.HP_GROWTH ** layer);
}

export function biomeForLayer(layer: number): { biome: Biome; cycle: number } {
  const idx = Math.floor(layer / GAME.LAYERS_PER_BIOME);
  return { biome: BIOMES[idx % BIOMES.length], cycle: Math.floor(idx / BIOMES.length) };
}

export function depthMeters(layer: number): number {
  return layer * GAME.METERS_PER_LAYER;
}

export function playerBonus(bonusSum: number): number {
  return Math.min(GAME.BONUS_CAP, 1 + bonusSum);
}
