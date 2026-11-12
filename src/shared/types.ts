import type { BIOMES } from '@/config/game';

export type Viewer = { userId: string; uniqueId: string; nickname: string; avatarUrl?: string };

export type LiveEvent =
  | { type: 'like'; user: Viewer; count: number }
  | { type: 'gift'; user: Viewer; giftName: string; diamonds: number; repeat: number }
  | { type: 'join'; user: Viewer }
  | { type: 'chat'; user: Viewer; text: string };

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Biome = (typeof BIOMES)[number];
export type ArtifactDef = { id: string; name: string; biome: Biome; rarity: Rarity };

export type AvatarView = {
  userId: string;
  uniqueId: string;
  avatarIndex: number;
  bonus: number;
  crowned: boolean;
};

export type GameSnapshot = {
  layer: number;
  depthM: number;
  biome: Biome;
  hp: number;
  maxHp: number;
  totalDigs: number;
  onBlock: AvatarView[];
  crowd: AvatarView[];
  crowdOverflow: number;
  activeCount: number;
  feed: string[];
};

export type BagItem = { artifact: ArtifactDef; count: number };
export type LeaderRow = { uniqueId: string; score: number; legendaries: number };

export type GameEvent =
  | { k: 'dig'; userId: string; digs: number; big: boolean }
  | { k: 'layerBroken'; layer: number; biome: Biome }
  | { k: 'artifact'; userId: string; uniqueId: string; artifact: ArtifactDef }
  | { k: 'bag'; uniqueId: string; items: BagItem[]; bonus: number }
  | { k: 'leaderboard'; rows: LeaderRow[] };

export type SourceKind = 'connector' | 'tikfinity';
export type SourceStatus = {
  kind: SourceKind | null;
  state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  error?: string;
  roomId?: string;
};

export type ServerMsg =
  | { t: 'snapshot'; s: GameSnapshot }
  | { t: 'events'; e: GameEvent[] }
  | { t: 'status'; s: SourceStatus };

export type ClientMsg =
  | { t: 'connect'; kind: 'connector'; username: string; signApiKey?: string }
  | { t: 'connect'; kind: 'tikfinity'; url: string }
  | { t: 'disconnect' }
  | { t: 'newLive' }
  | { t: 'mock'; event: LiveEvent };
