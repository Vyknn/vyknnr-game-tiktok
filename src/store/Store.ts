import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { GAME } from '@/config/game';
import { findArtifact } from '@/engine/artifacts';
import type { ArtifactDef, BagItem, LeaderRow, Viewer } from '@/shared/types';

export type SessionRow = { roomId: string | null; layer: number; hp: number; totalDigs: number };

export interface Store {
  upsertViewer(v: Viewer): void;
  addArtifact(userId: string, a: ArtifactDef, layer: number): void;
  bonusSum(userId: string): number;
  bag(userId: string): BagItem[];
  findUserIdByUniqueId(uniqueId: string): string | undefined;
  leaderboard(limit: number): LeaderRow[];
  loadSession(): SessionRow | null;
  saveSession(s: SessionRow): void;
}

const B = GAME.RARITY_BONUS;
const BONUS_SQL = `CASE rarity WHEN 'common' THEN ${B.common} WHEN 'rare' THEN ${B.rare}
  WHEN 'epic' THEN ${B.epic} WHEN 'legendary' THEN ${B.legendary} ELSE 0 END`;

export class SqliteStore implements Store {
  private db: Database.Database;
  private stmts;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS viewers (
        user_id TEXT PRIMARY KEY, unique_id TEXT NOT NULL, nickname TEXT, avatar_url TEXT, updated_at INTEGER);
      CREATE INDEX IF NOT EXISTS viewers_unique ON viewers(unique_id);
      CREATE TABLE IF NOT EXISTS artifacts (
        id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, artifact_id TEXT NOT NULL, rarity TEXT NOT NULL,
        layer INTEGER, found_at INTEGER);
      CREATE INDEX IF NOT EXISTS artifacts_user ON artifacts(user_id);
      CREATE TABLE IF NOT EXISTS session (
        id INTEGER PRIMARY KEY CHECK (id = 1), room_id TEXT, layer INTEGER, hp REAL, total_digs INTEGER, updated_at INTEGER);
    `);
    this.stmts = {
      upsertViewer: this.db.prepare(`INSERT INTO viewers (user_id, unique_id, nickname, avatar_url, updated_at)
        VALUES (@userId, @uniqueId, @nickname, @avatarUrl, @now)
        ON CONFLICT(user_id) DO UPDATE SET unique_id=excluded.unique_id, nickname=excluded.nickname,
          avatar_url=excluded.avatar_url, updated_at=excluded.updated_at`),
      addArtifact: this.db.prepare(`INSERT INTO artifacts (user_id, artifact_id, rarity, layer, found_at)
        VALUES (?, ?, ?, ?, ?)`),
      bonusSum: this.db.prepare(`SELECT COALESCE(SUM(${BONUS_SQL}), 0) AS s FROM artifacts WHERE user_id = ?`),
      bag: this.db.prepare(`SELECT artifact_id AS id, COUNT(*) AS n FROM artifacts WHERE user_id = ?
        GROUP BY artifact_id ORDER BY MAX(found_at) DESC`),
      byUnique: this.db.prepare(`SELECT user_id FROM viewers WHERE unique_id = ? ORDER BY updated_at DESC LIMIT 1`),
      leaderboard: this.db.prepare(`SELECT v.unique_id AS uniqueId,
          ROUND(SUM(${BONUS_SQL}) * 100) AS score,
          SUM(CASE a.rarity WHEN 'legendary' THEN 1 ELSE 0 END) AS legendaries
        FROM artifacts a JOIN viewers v ON v.user_id = a.user_id
        GROUP BY a.user_id ORDER BY score DESC, legendaries DESC LIMIT ?`),
      loadSession: this.db.prepare(`SELECT room_id, layer, hp, total_digs FROM session WHERE id = 1`),
      saveSession: this.db.prepare(`INSERT INTO session (id, room_id, layer, hp, total_digs, updated_at)
        VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET room_id=excluded.room_id, layer=excluded.layer,
          hp=excluded.hp, total_digs=excluded.total_digs, updated_at=excluded.updated_at`),
    };
  }

  upsertViewer(v: Viewer): void {
    this.stmts.upsertViewer.run({ ...v, avatarUrl: v.avatarUrl ?? null, now: Date.now() });
  }

  addArtifact(userId: string, a: ArtifactDef, layer: number): void {
    this.stmts.addArtifact.run(userId, a.id, a.rarity, layer, Date.now());
  }

  bonusSum(userId: string): number {
    return (this.stmts.bonusSum.get(userId) as { s: number }).s;
  }

  bag(userId: string): BagItem[] {
    return (this.stmts.bag.all(userId) as { id: string; n: number }[]).flatMap((r) => {
      const artifact = findArtifact(r.id);
      return artifact ? [{ artifact, count: r.n }] : [];
    });
  }

  findUserIdByUniqueId(uniqueId: string): string | undefined {
    return (this.stmts.byUnique.get(uniqueId) as { user_id: string } | undefined)?.user_id;
  }

  leaderboard(limit: number): LeaderRow[] {
    return this.stmts.leaderboard.all(limit) as LeaderRow[];
  }

  loadSession(): SessionRow | null {
    const r = this.stmts.loadSession.get() as
      | { room_id: string | null; layer: number; hp: number; total_digs: number } | undefined;
    return r ? { roomId: r.room_id, layer: r.layer, hp: r.hp, totalDigs: r.total_digs } : null;
  }

  saveSession(s: SessionRow): void {
    this.stmts.saveSession.run(s.roomId, s.layer, s.hp, s.totalDigs, Date.now());
  }
}
