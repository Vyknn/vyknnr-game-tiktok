import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '@/engine/GameEngine';
import { SqliteStore } from '@/store/Store';
import { ARTIFACTS } from '@/engine/artifacts';
import type { GameEvent, LiveEvent, Viewer } from '@/shared/types';

const nong: Viewer = { userId: '42', uniqueId: 'nong', nickname: 'Nong' };
const joe: Viewer = { userId: '7', uniqueId: 'joe', nickname: 'Joe' };
const like = (user: Viewer, count: number): LiveEvent => ({ type: 'like', user, count });
const gift = (user: Viewer, diamonds: number, repeat = 1): LiveEvent =>
  ({ type: 'gift', user, giftName: 'Rose', diamonds, repeat });

let store: SqliteStore;
let clock: number;
let rngCalls: number;
let rngValue: number;
const make = () => new GameEngine({
  store, now: () => clock, rng: () => { rngCalls++; return rngValue; },
});
beforeEach(() => { store = new SqliteStore(':memory:'); clock = 0; rngCalls = 0; rngValue = 0.99; });

const ofKind = <K extends GameEvent['k']>(evs: GameEvent[], k: K) =>
  evs.filter((e): e is Extract<GameEvent, { k: K }> => e.k === k);

describe('GameEngine digging', () => {
  it('a like of 5 deals 5 damage', () => {
    const g = make(); g.startSession(null);
    g.handle(like(nong, 5));
    g.tick();
    expect(g.snapshot().hp).toBe(95);
    expect(g.snapshot().totalDigs).toBe(5);
  });
  it('a Rose gift digs 10', () => {
    const g = make(); g.startSession(null);
    g.handle(gift(nong, 1));
    g.tick();
    expect(g.snapshot().totalDigs).toBe(10);
  });
  it('a whale gift breaks many layers in one tick without flooding events', () => {
    const g = make(); g.startSession(null);
    g.handle(gift(nong, 30000));
    const t0 = performance.now();
    const evs = g.tick();
    const elapsed = performance.now() - t0;
    const s = g.snapshot();
    expect(s.layer).toBeGreaterThan(0);
    expect(ofKind(evs, 'layerBroken')).toHaveLength(s.layer);
    expect(ofKind(evs, 'dig').length).toBeLessThanOrEqual(3);
    expect(rngCalls).toBe(20);
    expect(elapsed).toBeLessThan(50);
  });
  it('carries leftover damage across a broken layer', () => {
    const g = make(); g.startSession(null);
    g.handle(like(nong, 130)); // layer0 hp 100, layer1 hp 115
    g.tick();
    expect(g.snapshot().layer).toBe(1);
    expect(g.snapshot().hp).toBe(85);
  });
  it('applies the artifact bonus of the digger', () => {
    store.upsertViewer(nong);
    store.addArtifact('42', ARTIFACTS.find((a) => a.rarity === 'epic')!, 0);
    const g = make(); g.startSession(null);
    g.handle(like(nong, 10));
    g.tick();
    expect(g.snapshot().hp).toBeCloseTo(100 - 10.8);
  });
  it('caps the bonus at ×5', () => {
    const leg = ARTIFACTS.find((a) => a.rarity === 'legendary')!;
    for (let i = 0; i < 30; i++) store.addArtifact('42', leg, 0);
    const g = make(); g.startSession(null);
    g.handle(like(nong, 1));
    g.tick();
    expect(g.snapshot().hp).toBe(95);
  });
  it('ignores zero, negative and NaN likes', () => {
    const g = make(); g.startSession(null);
    expect(() => { g.handle(like(nong, 0)); g.handle(like(nong, NaN)); g.handle(like(nong, -4)); }).not.toThrow();
    const evs = g.tick();
    expect(evs).toEqual([]);
    expect(g.snapshot().totalDigs).toBe(0);
  });
});

describe('GameEngine artifacts', () => {
  it('awards the drop to the digger and stores it', () => {
    rngValue = 0; // always drop
    const g = make(); g.startSession(null);
    g.handle(like(joe, 1));
    const evs = g.tick();
    const art = ofKind(evs, 'artifact');
    expect(art).toHaveLength(1);
    expect(art[0].userId).toBe('7');
    expect(art[0].uniqueId).toBe('joe');
    expect(store.bag('7')).toHaveLength(1);
    expect(g.snapshot().feed[0]).toContain('@joe');
  });
  it('!bag chat emits a bag event next tick', () => {
    rngValue = 0;
    const g = make(); g.startSession(null);
    g.handle(like(joe, 1));
    g.tick();
    g.handle({ type: 'chat', user: joe, text: '  !BAG ' });
    const bag = ofKind(g.tick(), 'bag');
    expect(bag).toHaveLength(1);
    expect(bag[0].uniqueId).toBe('joe');
    expect(bag[0].items).toHaveLength(1);
    expect(bag[0].bonus).toBeGreaterThan(1);
  });
});

describe('GameEngine roster + feed', () => {
  it('big gifts crown the sender and puts them on the block', () => {
    const g = make(); g.startSession(null);
    g.handle({ type: 'join', user: joe });
    g.handle(gift(nong, 100));
    const evs = g.tick();
    const s = g.snapshot();
    expect(s.onBlock.map((a) => a.userId)).toEqual(['42']);
    expect(s.onBlock[0].crowned).toBe(true);
    expect(s.crowd.map((a) => a.userId)).toEqual(['7']);
    expect(ofKind(evs, 'dig')[0].big).toBe(true);
    expect(s.feed[0]).toContain('🎁 @nong');
  });
  it('coalesces like feed lines per user per tick and caps the feed', () => {
    const g = make(); g.startSession(null);
    g.handle(like(nong, 3)); g.handle(like(nong, 4));
    g.tick();
    expect(g.snapshot().feed.filter((l) => l.startsWith('❤'))).toEqual(['❤ @nong x7']);
    for (let i = 0; i < 10; i++) { g.handle({ type: 'join', user: { ...joe, userId: `${i}`, uniqueId: `j${i}` } }); }
    g.tick();
    expect(g.snapshot().feed).toHaveLength(6);
  });
});

describe('GameEngine memory', () => {
  it('forgets idle viewers and their cached bonus over a long live', () => {
    const g = make(); g.startSession(null);
    for (let i = 0; i < 500; i++) g.handle({ type: 'join', user: { userId: `${i}`, uniqueId: `u${i}`, nickname: '' } });
    g.tick();
    clock = 11 * 60_000;
    for (let i = 0; i < 50; i++) g.tick(); // sweep runs every SWEEP_EVERY_TICKS
    const s = g.snapshot();
    expect(s.crowd).toHaveLength(0);
    expect(s.crowdOverflow).toBe(0);
  });
});

describe('GameEngine sessions', () => {
  it('resumes the same room after restart, resets on a new room', () => {
    const g = make(); g.startSession('A');
    g.handle(like(nong, 100 + 115 + 10)); g.tick();
    expect(g.snapshot().layer).toBe(2);
    g.persist();

    const g2 = make(); g2.startSession('A');
    expect(g2.snapshot().layer).toBe(2);
    expect(g2.snapshot().hp).toBeCloseTo(g.snapshot().hp);

    g2.startSession('B');
    expect(g2.snapshot().layer).toBe(0);
    expect(g2.snapshot().hp).toBe(100);
  });
  it('newLive resets depth and roster', () => {
    const g = make(); g.startSession('A');
    g.handle(like(nong, 300)); g.tick();
    g.newLive();
    const s = g.snapshot();
    expect(s.layer).toBe(0);
    expect(s.totalDigs).toBe(0);
    expect(s.onBlock).toHaveLength(0);
    expect(s.crowd).toHaveLength(0);
  });
  it('skips the leaderboard while nobody has artifacts', () => {
    const g = make(); g.startSession(null);
    clock = 90_000;
    expect(g.maybeLeaderboard()).toBeNull();
  });
  it('emits a leaderboard on the interval', () => {
    store.upsertViewer(nong);
    store.addArtifact('42', ARTIFACTS[0], 0);
    const g = make(); g.startSession(null);
    expect(g.maybeLeaderboard()).toBeNull();
    clock = 90_000;
    expect(g.maybeLeaderboard()?.k).toBe('leaderboard');
    expect(g.maybeLeaderboard()).toBeNull();
  });
});
