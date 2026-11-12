import { GAME } from '@/config/game';
import type { ArtifactDef, Biome, Rarity } from '@/shared/types';

export type Rng = () => number;

/** [common, common, rare, epic, legendary] names per biome. Original content. */
const NAMES: Record<Biome, [string, string, string, string, string]> = {
  grass: ['Lucky Clover', 'Lost Button', 'Pebble Frog', 'Dew Lantern', 'Rainbow Acorn'],
  dirt: ['Rusty Spoon', 'Old Bottle Cap', 'Clay Owl', 'Fossil Snail', 'Sun Medallion'],
  stone: ['Flint Arrowhead', 'Iron Nail', 'Carved Rune', 'Stone Mask', 'Titan Tooth'],
  coal: ['Miner Badge', 'Soot Gem', 'Ember Ring', 'Dragon Scale', 'Heart of Coal'],
  crystal: ['Glass Shard', 'Quartz Chip', 'Prism Moth', 'Crystal Skull', 'Star Geode'],
  marble: ['Marble Coin', 'Chalk Feather', 'Statue Hand', 'Ivory Crown', 'Oracle Eye'],
  magma: ['Lava Pebble', 'Obsidian Chip', 'Fire Opal', 'Phoenix Egg', 'Core Ember'],
};
const SLOT_RARITY: Rarity[] = ['common', 'common', 'rare', 'epic', 'legendary'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const ARTIFACTS: readonly ArtifactDef[] = (Object.keys(NAMES) as Biome[]).flatMap((biome) =>
  NAMES[biome].map((name, i) => ({ id: `${biome}-${slug(name)}`, name, biome, rarity: SLOT_RARITY[i] })),
);

const BY_ID = new Map(ARTIFACTS.map((a) => [a.id, a]));
export function findArtifact(id: string): ArtifactDef | undefined {
  return BY_ID.get(id);
}

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const WEIGHT_TOTAL = RARITIES.reduce((s, r) => s + GAME.RARITY_WEIGHTS[r], 0);

function pickRarity(r: number): Rarity {
  let x = r * WEIGHT_TOTAL;
  for (const rarity of RARITIES) {
    x -= GAME.RARITY_WEIGHTS[rarity];
    if (x < 0) return rarity;
  }
  return 'legendary';
}

export function rollArtifact(rng: Rng, biome: Biome): ArtifactDef | null {
  if (rng() >= GAME.DROP_CHANCE_PER_ROLL) return null;
  const rarity = pickRarity(rng());
  const pool = ARTIFACTS.filter((a) => a.biome === biome && a.rarity === rarity);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
