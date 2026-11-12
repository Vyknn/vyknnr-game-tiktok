import { describe, it, expect } from 'vitest';
import {
  likeToDigs, giftToDigs, giftRolls, layerMaxHp, biomeForLayer, depthMeters, playerBonus,
} from '@/engine/digMath';

describe('digMath', () => {
  it('converts gifts to digs with multiplier 10', () => {
    expect(giftToDigs(1, 1)).toBe(10);
    expect(giftToDigs(30000, 1)).toBe(300000);
    expect(giftToDigs(1, 10)).toBe(100);
    expect(giftToDigs(-5, 1)).toBe(0);
  });
  it('caps gift artifact rolls at ceil(sqrt) ≤ 20', () => {
    expect(giftRolls(10)).toBe(4);
    expect(giftRolls(300000)).toBe(20);
    expect(giftRolls(0)).toBe(0);
  });
  it('clamps likes to non-negative integers', () => {
    expect(likeToDigs(-3)).toBe(0);
    expect(likeToDigs(5.7)).toBe(5);
    expect(likeToDigs(NaN)).toBe(0);
  });
  it('grows layer HP by 1.15 per layer', () => {
    expect(layerMaxHp(0)).toBe(100);
    expect(layerMaxHp(10)).toBe(405);
  });
  it('maps layers to biomes, wrapping every 70 layers', () => {
    expect(biomeForLayer(0).biome).toBe('grass');
    expect(biomeForLayer(10).biome).toBe('dirt');
    expect(biomeForLayer(70)).toEqual({ biome: 'grass', cycle: 1 });
  });
  it('computes depth in meters', () => {
    expect(depthMeters(5)).toBe(10);
  });
  it('clamps absurd event sizes so a tick always terminates', () => {
    expect(likeToDigs(1e300)).toBe(1000);
    expect(giftToDigs(1e300, 1e9)).toBe(10_000_000);
    expect(giftToDigs(Infinity, 1)).toBe(0);
  });
  it('caps player bonus at ×5', () => {
    expect(playerBonus(0.5)).toBe(1.5);
    expect(playerBonus(10)).toBe(5);
  });
});
