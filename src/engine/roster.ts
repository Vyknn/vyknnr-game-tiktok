import { GAME } from '@/config/game';
import { avatarIndex } from '@/shared/avatar';
import type { AvatarView, GameSnapshot, Viewer } from '@/shared/types';

type Entry = { viewer: Viewer; bonus: number; lastSeenAt: number; lastActiveAt: number; crownedUntil: number };
export type RosterView = Pick<GameSnapshot, 'onBlock' | 'crowd' | 'crowdOverflow' | 'activeCount'>;

/** Tracks who is in the live and who is currently digging on the block. */
export class Roster {
  private entries = new Map<string, Entry>();

  touch(v: Viewer, now: number, opts: { active?: boolean; crown?: boolean } = {}): void {
    const e = this.entries.get(v.userId) ?? {
      viewer: v, bonus: 1, lastSeenAt: now, lastActiveAt: -Infinity, crownedUntil: -Infinity,
    };
    e.viewer = v;
    e.lastSeenAt = now;
    if (opts.active) e.lastActiveAt = now;
    if (opts.crown) e.crownedUntil = now + GAME.CROWN_MS;
    this.entries.set(v.userId, e);
  }

  setBonus(userId: string, bonus: number): void {
    const e = this.entries.get(userId);
    if (e) e.bonus = bonus;
  }

  get(userId: string): { viewer: Viewer; bonus: number } | undefined {
    const e = this.entries.get(userId);
    return e && { viewer: e.viewer, bonus: e.bonus };
  }

  view(now: number): RosterView {
    const all = [...this.entries.values()];
    const cutoff = now - GAME.ACTIVE_WINDOW_MS;
    const active = all.filter((e) => e.lastActiveAt >= cutoff).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    const onBlock = active.slice(0, GAME.MAX_ON_BLOCK);
    const onBlockIds = new Set(onBlock.map((e) => e.viewer.userId));
    const rest = all.filter((e) => !onBlockIds.has(e.viewer.userId)).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    const toView = (e: Entry): AvatarView => ({
      userId: e.viewer.userId,
      uniqueId: e.viewer.uniqueId,
      avatarIndex: avatarIndex(e.viewer.userId, GAME.AVATAR_COUNT),
      bonus: e.bonus,
      crowned: e.crownedUntil > now,
    });
    return {
      onBlock: onBlock.map(toView),
      crowd: rest.slice(0, GAME.MAX_CROWD).map(toView),
      crowdOverflow: Math.max(0, rest.length - GAME.MAX_CROWD),
      activeCount: active.length,
    };
  }

  clear(): void {
    this.entries.clear();
  }
}
