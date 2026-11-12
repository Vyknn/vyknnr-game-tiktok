import { describe, it, expect } from 'vitest';
import { compact } from '@/game/format';

describe('compact', () => {
  it('formats numbers for the HP bar', () => {
    expect(compact(85)).toBe('85');
    expect(compact(84.2)).toBe('85');
    expect(compact(12345)).toBe('12.3K');
    expect(compact(405000)).toBe('405K');
    expect(compact(2_500_000)).toBe('2.5M');
  });
});
