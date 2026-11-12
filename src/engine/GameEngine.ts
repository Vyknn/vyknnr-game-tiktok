import { GAME } from '@/config/game';
import type { GameEvent, GameSnapshot, LiveEvent, Viewer } from '@/shared/types';
import type { Store } from '@/store/Store';
import { rollArtifact, type Rng } from './artifacts';
import { DigQueue } from './digQueue';
import {
  biomeForLayer, depthMeters, giftRolls, giftToDigs, layerMaxHp, likeToDigs, playerBonus,
} from './digMath';
import { Roster } from './roster';

type Deps = { store: Store; rng: Rng; now: () => number };

/** Authoritative game state. Lives on the server; browsers only render its output. */
export class GameEngine {
  private queue = new DigQueue();
  private roster = new Roster();
  private feed: string[] = [];
  private pendingLikes = new Map<string, { uniqueId: string; count: number }>();
  private pendingBags = new Set<string>();
  private bonusCache = new Map<string, number>();
  private roomId: string | null | undefined = undefined;
  private layer = 0;
  private hp = layerMaxHp(0);
  private totalDigs = 0;
  private lastLeaderboardAt: number;
  private ticks = 0;

  constructor(private deps: Deps) {
    this.lastLeaderboardAt = deps.now();
    const saved = deps.store.loadSession();
    if (saved) {
      this.roomId = saved.roomId;
      this.layer = saved.layer;
      this.hp = saved.hp;
      this.totalDigs = saved.totalDigs;
    }
  }

  handle(e: LiveEvent): void {
    try {
      this.handleUnsafe(e);
    } catch (err) {
      console.error('[engine] bad event', err, e);
    }
  }

  private handleUnsafe(e: LiveEvent): void {
    const now = this.deps.now();
    switch (e.type) {
      case 'like': {
        const digs = likeToDigs(e.count);
        if (digs === 0) return;
        this.seen(e.user, now, { active: true });
        this.queue.push({ userId: e.user.userId, digs, rolls: digs, big: false });
        const p = this.pendingLikes.get(e.user.userId) ?? { uniqueId: e.user.uniqueId, count: 0 };
        p.count += digs;
        this.pendingLikes.set(e.user.userId, p);
        return;
      }
      case 'gift': {
        const digs = giftToDigs(e.diamonds, e.repeat);
        if (digs === 0) return;
        const big = digs >= GAME.BIG_GIFT_DIGS;
        this.seen(e.user, now, { active: true, crown: big });
        this.queue.push({ userId: e.user.userId, digs, rolls: giftRolls(digs), big });
        this.pushFeed(`🎁 @${e.user.uniqueId} ส่ง ${e.giftName} → +${digs} ขุด`);
        return;
      }
      case 'join':
        this.seen(e.user, now);
        this.pushFeed(`👋 @${e.user.uniqueId} เข้ามาแล้ว`);
        return;
      case 'chat':
        this.seen(e.user, now);
        if (e.text.trim().toLowerCase() === '!bag') this.pendingBags.add(e.user.userId);
        return;
    }
  }

  tick(): GameEvent[] {
    const events: GameEvent[] = [];
    if (++this.ticks % GAME.SWEEP_EVERY_TICKS === 0) {
      for (const id of this.roster.sweep(this.deps.now())) this.bonusCache.delete(id);
    }
    for (const { uniqueId, count } of this.pendingLikes.values()) this.pushFeed(`❤ @${uniqueId} x${count}`);
    this.pendingLikes.clear();

    const jobs = this.queue.drainAll();
    jobs.forEach((job, i) => {
      if (i < GAME.MAX_DIG_EVENTS_PER_TICK) events.push({ k: 'dig', userId: job.userId, digs: job.digs, big: job.big });
      this.totalDigs += job.digs;
      this.applyDamage(job.digs * GAME.BASE_DAMAGE * this.bonusOf(job.userId), events);
      this.rollDrops(job.userId, job.rolls, events);
    });

    for (const userId of this.pendingBags) {
      const v = this.roster.get(userId)?.viewer;
      events.push({
        k: 'bag', uniqueId: v?.uniqueId ?? userId,
        items: this.deps.store.bag(userId), bonus: this.bonusOf(userId),
      });
    }
    this.pendingBags.clear();
    return events;
  }

  private applyDamage(damage: number, events: GameEvent[]): void {
    let left = damage;
    while (left >= this.hp) {
      left -= this.hp;
      this.layer++;
      this.hp = layerMaxHp(this.layer);
      events.push({ k: 'layerBroken', layer: this.layer, biome: biomeForLayer(this.layer).biome });
    }
    this.hp -= left;
  }

  private rollDrops(userId: string, rolls: number, events: GameEvent[]): void {
    const { biome } = biomeForLayer(this.layer);
    for (let r = 0; r < rolls; r++) {
      const artifact = rollArtifact(this.deps.rng, biome);
      if (!artifact) continue;
      this.deps.store.addArtifact(userId, artifact, this.layer);
      this.bonusCache.delete(userId);
      this.roster.setBonus(userId, this.bonusOf(userId));
      const uniqueId = this.roster.get(userId)?.viewer.uniqueId ?? userId;
      events.push({ k: 'artifact', userId, uniqueId, artifact });
      this.pushFeed(`✨ @${uniqueId} ได้ ${artifact.name} (${artifact.rarity})!`);
    }
  }

  private bonusOf(userId: string): number {
    let b = this.bonusCache.get(userId);
    if (b === undefined) {
      b = playerBonus(this.deps.store.bonusSum(userId));
      this.bonusCache.set(userId, b);
    }
    return b;
  }

  private seen(v: Viewer, now: number, opts?: { active?: boolean; crown?: boolean }): void {
    if (!this.roster.get(v.userId)) this.deps.store.upsertViewer(v);
    this.roster.touch(v, now, opts);
    this.roster.setBonus(v.userId, this.bonusOf(v.userId));
  }

  private pushFeed(line: string): void {
    this.feed.unshift(line);
    if (this.feed.length > GAME.FEED_MAX) this.feed.length = GAME.FEED_MAX;
  }

  snapshot(): GameSnapshot {
    const { biome } = biomeForLayer(this.layer);
    return {
      layer: this.layer,
      depthM: depthMeters(this.layer),
      biome,
      hp: this.hp,
      maxHp: layerMaxHp(this.layer),
      totalDigs: this.totalDigs,
      ...this.roster.view(this.deps.now()),
      feed: [...this.feed],
    };
  }

  /** Same room as the saved one → keep going; anything else → fresh live. */
  startSession(roomId: string | null): void {
    if (this.roomId !== undefined && this.roomId === roomId) return;
    this.roomId = roomId;
    this.newLive();
  }

  newLive(): void {
    this.layer = 0;
    this.hp = layerMaxHp(0);
    this.totalDigs = 0;
    this.roster.clear();
    this.bonusCache.clear();
    this.queue.drainAll();
    this.pendingLikes.clear();
    this.pendingBags.clear();
    this.feed = [];
    this.persist();
  }

  persist(): void {
    this.deps.store.saveSession({
      roomId: this.roomId ?? null, layer: this.layer, hp: this.hp, totalDigs: this.totalDigs,
    });
  }

  maybeLeaderboard(): GameEvent | null {
    const now = this.deps.now();
    if (now - this.lastLeaderboardAt < GAME.LEADERBOARD_INTERVAL_MS) return null;
    this.lastLeaderboardAt = now;
    const rows = this.deps.store.leaderboard(5);
    return rows.length ? { k: 'leaderboard', rows } : null;
  }
}
