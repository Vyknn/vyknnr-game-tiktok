import { describe, it, expect } from 'vitest';
import { DigQueue } from '@/engine/digQueue';

describe('DigQueue', () => {
  it('drains jobs FIFO and empties', () => {
    const q = new DigQueue();
    q.push({ userId: 'a', digs: 1, rolls: 1, big: false });
    q.push({ userId: 'b', digs: 2, rolls: 2, big: false });
    expect(q.size).toBe(2);
    expect(q.drainAll().map((j) => j.userId)).toEqual(['a', 'b']);
    expect(q.size).toBe(0);
    expect(q.drainAll()).toEqual([]);
  });
});
