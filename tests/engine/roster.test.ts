import { describe, it, expect } from 'vitest';
import { Roster } from '@/engine/roster';
import type { Viewer } from '@/shared/types';

const v = (n: number): Viewer => ({ userId: `${n}`, uniqueId: `u${n}`, nickname: `N${n}` });

describe('Roster', () => {
  it('caps on-block at 12, most recent first, rest go to crowd', () => {
    const r = new Roster();
    for (let i = 0; i < 15; i++) r.touch(v(i), i, { active: true });
    const view = r.view(100);
    expect(view.onBlock).toHaveLength(12);
    expect(view.onBlock[0].userId).toBe('14');
    expect(view.crowd.map((a) => a.userId).sort()).toEqual(['0', '1', '2']);
    expect(view.activeCount).toBe(15);
  });
  it('drops off the block after the 15s active window', () => {
    const r = new Roster();
    r.touch(v(1), 0, { active: true });
    expect(r.view(14_999).onBlock).toHaveLength(1);
    const later = r.view(15_001);
    expect(later.onBlock).toHaveLength(0);
    expect(later.crowd[0].userId).toBe('1');
  });
  it('caps crowd at 20 with overflow count', () => {
    const r = new Roster();
    for (let i = 0; i < 40; i++) r.touch(v(i), i);
    const view = r.view(100);
    expect(view.crowd).toHaveLength(20);
    expect(view.crowdOverflow).toBe(20);
    expect(view.onBlock).toHaveLength(0);
  });
  it('crowns until CROWN_MS elapses', () => {
    const r = new Roster();
    r.touch(v(1), 0, { active: true, crown: true });
    expect(r.view(9_999).onBlock[0].crowned).toBe(true);
    r.touch(v(1), 10_001, { active: true });
    expect(r.view(10_001).onBlock[0].crowned).toBe(false);
  });
  it('exposes bonus and deterministic avatar index', () => {
    const r = new Roster();
    r.touch(v(1), 0, { active: true });
    r.setBonus('1', 1.4);
    expect(r.get('1')?.bonus).toBe(1.4);
    const a1 = r.view(0).onBlock[0];
    expect(a1.bonus).toBe(1.4);
    expect(a1.avatarIndex).toBeGreaterThanOrEqual(0);
    expect(a1.avatarIndex).toBeLessThan(8);
  });
  it('clear removes everyone', () => {
    const r = new Roster();
    r.touch(v(1), 0, { active: true });
    r.clear();
    expect(r.view(0).onBlock).toHaveLength(0);
    expect(r.get('1')).toBeUndefined();
  });
});
