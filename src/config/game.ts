/** All balance numbers for the game. Tune here only. */
export const GAME = {
  TICK_MS: 100,
  BASE_DAMAGE: 1,
  BASE_HP: 100,
  HP_GROWTH: 1.15,
  LAYERS_PER_BIOME: 10,
  METERS_PER_LAYER: 2,
  GIFT_MULTIPLIER: 10,
  GIFT_ROLL_CAP: 20,
  DROP_CHANCE_PER_ROLL: 0.02,
  RARITY_WEIGHTS: { common: 70, rare: 22, epic: 7, legendary: 1 },
  RARITY_BONUS: { common: 0.01, rare: 0.03, epic: 0.08, legendary: 0.25 },
  BONUS_CAP: 5,
  MAX_DIG_EVENTS_PER_TICK: 3,
  ACTIVE_WINDOW_MS: 15_000,
  MAX_ON_BLOCK: 12,
  MAX_CROWD: 20,
  BIG_GIFT_DIGS: 100,
  CROWN_MS: 10_000,
  BAG_SHOW_MS: 8_000,
  LEADERBOARD_INTERVAL_MS: 90_000,
  SAVE_INTERVAL_MS: 5_000,
  FEED_MAX: 6,
  AVATAR_COUNT: 8,
  /** Sanity caps per event so a malformed/hostile payload can't hang the tick or overflow HP. */
  MAX_LIKES_PER_EVENT: 1_000,
  /** Viewers unseen this long drop out of memory (they keep their artifacts in the DB). */
  IDLE_EVICT_MS: 10 * 60_000,
  SWEEP_EVERY_TICKS: 50,
  MAX_DIGS_PER_GIFT: 10_000_000,
} as const;

export const BIOMES = ['grass', 'dirt', 'stone', 'coal', 'crystal', 'marble', 'magma'] as const;

export const BIOME_NAMES_TH: Record<(typeof BIOMES)[number], string> = {
  grass: 'หญ้า',
  dirt: 'ดิน',
  stone: 'หิน',
  coal: 'ถ่านหิน',
  crystal: 'คริสตัล',
  marble: 'หินอ่อน',
  magma: 'แมกมา',
};
