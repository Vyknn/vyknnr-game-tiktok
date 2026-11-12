import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteStore } from '@/store/Store';
import { ARTIFACTS } from '@/engine/artifacts';

const epic = ARTIFACTS.find((a) => a.rarity === 'epic')!;
const common = ARTIFACTS.find((a) => a.rarity === 'common')!;
const legendary = ARTIFACTS.find((a) => a.rarity === 'legendary')!;
const viewer = { userId: '42', uniqueId: 'nong', nickname: 'Nong' };

let store: SqliteStore;
beforeEach(() => { store = new SqliteStore(':memory:'); });

describe('SqliteStore', () => {
  it('sums artifact bonuses', () => {
    store.upsertViewer(viewer);
    store.addArtifact('42', epic, 3);
    store.addArtifact('42', common, 1);
    store.addArtifact('42', common, 2);
    expect(store.bonusSum('42')).toBeCloseTo(0.10);
    expect(store.bonusSum('nobody')).toBe(0);
  });
  it('groups bag counts', () => {
    store.addArtifact('42', common, 1);
    store.addArtifact('42', common, 2);
    store.addArtifact('42', epic, 3);
    const bag = store.bag('42');
    expect(bag.find((b) => b.artifact.id === common.id)?.count).toBe(2);
    expect(bag.find((b) => b.artifact.id === epic.id)?.count).toBe(1);
  });
  it('keeps the collection when the username changes', () => {
    store.upsertViewer(viewer);
    store.addArtifact('42', epic, 3);
    store.upsertViewer({ ...viewer, uniqueId: 'nong_new' });
    expect(store.findUserIdByUniqueId('nong_new')).toBe('42');
    expect(store.findUserIdByUniqueId('nong')).toBeUndefined();
    expect(store.bag('42')).toHaveLength(1);
  });
  it('round-trips the session and returns null when empty', () => {
    expect(store.loadSession()).toBeNull();
    store.saveSession({ roomId: 'R1', layer: 7, hp: 55, totalDigs: 999 });
    expect(store.loadSession()).toEqual({ roomId: 'R1', layer: 7, hp: 55, totalDigs: 999 });
    store.saveSession({ roomId: null, layer: 0, hp: 100, totalDigs: 0 });
    expect(store.loadSession()?.roomId).toBeNull();
  });
  it('orders the leaderboard by score', () => {
    store.upsertViewer(viewer);
    store.upsertViewer({ userId: '7', uniqueId: 'joe', nickname: 'Joe' });
    store.addArtifact('42', common, 1);
    store.addArtifact('7', legendary, 1);
    const rows = store.leaderboard(5);
    expect(rows.map((r) => r.uniqueId)).toEqual(['joe', 'nong']);
    expect(rows[0]).toEqual({ uniqueId: 'joe', score: 25, legendaries: 1 });
  });
});
