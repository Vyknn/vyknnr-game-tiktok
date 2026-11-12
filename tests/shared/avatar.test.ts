import { describe, it, expect } from 'vitest';
import { avatarIndex } from '@/shared/avatar';

describe('avatarIndex', () => {
  it('returns an index within [0, count)', () => {
    const i = avatarIndex('123', 8);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(8);
    expect(Number.isInteger(i)).toBe(true);
  });
  it('is deterministic per userId', () => {
    expect(avatarIndex('123', 8)).toBe(avatarIndex('123', 8));
    expect(avatarIndex('a', 8)).toBe(avatarIndex('a', 8));
    expect(avatarIndex('b', 8)).toBe(avatarIndex('b', 8));
  });
  it('spreads different ids across avatars', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, n) => avatarIndex(`user${n}`, 8)));
    expect(seen.size).toBe(8);
  });
  it('handles empty string', () => {
    expect(() => avatarIndex('', 8)).not.toThrow();
    expect(avatarIndex('', 8)).toBeLessThan(8);
  });
});
