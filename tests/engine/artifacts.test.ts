import { describe, it, expect } from 'vitest';
import { ARTIFACTS, rollArtifact, findArtifact } from '@/engine/artifacts';
import { BIOMES } from '@/config/game';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('artifact catalog', () => {
  it('has 2 common, 1 rare, 1 epic, 1 legendary per biome with unique ids', () => {
    for (const b of BIOMES) {
      const list = ARTIFACTS.filter((a) => a.biome === b);
      expect(list).toHaveLength(5);
      const count = (r: string) => list.filter((a) => a.rarity === r).length;
      expect([count('common'), count('rare'), count('epic'), count('legendary')]).toEqual([2, 1, 1, 1]);
    }
    expect(new Set(ARTIFACTS.map((a) => a.id)).size).toBe(ARTIFACTS.length);
  });
  it('finds by id', () => {
    expect(findArtifact(ARTIFACTS[0].id)).toBe(ARTIFACTS[0]);
    expect(findArtifact('nope')).toBeUndefined();
  });
});

describe('rollArtifact', () => {
  it('returns null on a miss', () => {
    expect(rollArtifact(seq([0.5]), 'dirt')).toBeNull();
  });
  it('returns a common of the biome on lowest rarity roll', () => {
    const a = rollArtifact(seq([0, 0, 0]), 'dirt');
    expect(a?.rarity).toBe('common');
    expect(a?.biome).toBe('dirt');
  });
  it('returns a legendary on the top rarity roll', () => {
    expect(rollArtifact(seq([0, 0.999, 0]), 'magma')?.rarity).toBe('legendary');
  });
  it('drops at ~2% per roll', () => {
    let hits = 0;
    for (let i = 0; i < 100_000; i++) if (rollArtifact(Math.random, 'stone')) hits++;
    expect(Math.abs(hits / 100_000 - 0.02)).toBeLessThan(0.003);
  });
});
