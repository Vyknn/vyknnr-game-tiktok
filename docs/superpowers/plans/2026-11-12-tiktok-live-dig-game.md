# Dig Party (TikTok Live Dig Game) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js app that streamers open in OBS. TikTok likes and gifts drive digging through an endless isometric layered block. Each viewer gets a pixel avatar, and the artifacts they find are kept across lives and make that viewer dig harder.

**Architecture:** One Node process (`server.ts`) runs Next.js, a WebSocket hub at `/ws`, the authoritative `GameEngine`, and one live-event source adapter at a time. The engine is pure TypeScript with injected store/rng/clock, and it ticks every 100 ms. It broadcasts a `GameSnapshot` plus per-tick `GameEvent[]`. `/game` is a thin Phaser 3 renderer of that stream. `/control` is the streamer panel. SQLite stores viewers, artifacts and the current session.

**Tech Stack:** Next.js (App Router, TypeScript, `src/`), Phaser 3, `ws`, `better-sqlite3`, `tiktok-live-connector` (v2, Euler Stream signing), `tsx`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-tiktok-live-dig-game-design.md`

## Global Constraints

- Original IP only: no names, characters, art, or UI look copied from the reference game. Placeholder art is generated in code in v1.
- `/game` canvas is 1080×1920 (9:16), Phaser `pixelArt: true`, scaled with `Phaser.Scale.FIT`.
- Phaser must load client-side only: `dynamic(() => import(...), { ssr: false })`.
- All balance numbers live in `src/config/game.ts`. No magic numbers elsewhere.
- Exactly one real source (connector **or** TikFinity) is active at a time. Mock events are always accepted.
- Artifact owner key = TikTok numeric `userId`. Fallback `u:<uniqueId>` only when `userId` is absent.
- Commit messages: no `Co-Authored-By` or any attribution trailer (user rule).
- Server is source of truth. The browser never computes damage.

## Config values (`src/config/game.ts`, exact)

```ts
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
  RARITY_BONUS:   { common: 0.01, rare: 0.03, epic: 0.08, legendary: 0.25 },
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
} as const;
export const BIOMES = ['grass','dirt','stone','coal','crystal','marble','magma'] as const;
```

## Review Focus

1. **Gift streaks**: the connector sends a streakable gift (`giftType === 1`) many times with `repeatEnd: false`. Count it only on `repeatEnd: true`, otherwise one Rose ×10 counts 55 times. Test lives in Task 7.
2. **Whale gift**: 30,000 diamonds becomes 300,000 digs in one tick. That can break many layers with HP carried over, gives at most 20 artifact rolls, emits at most 3 dig events, and must not block the tick for more than about 10 ms. Test lives in Task 6.
3. **OBS refresh mid-live**: a new `/ws` client gets the current snapshot immediately, and depth is unchanged. Test lives in Task 8.
4. **Server restart / reconnect**: the same `roomId` resumes the saved layer and HP, a different `roomId` resets to layer 0, and `newLive` always resets. Test lives in Task 6.
5. **Missing or odd fields**: a TikFinity/mock payload without `userId`, an empty nickname, or `likeCount: 0` is normalized or dropped without throwing. A malformed ws message is ignored. Tests live in Task 7 and Task 8.

---

## File Structure

```
server.ts                         custom server: Next + ws hub + engine + sources
src/config/game.ts                constants above
src/shared/types.ts               LiveEvent, Viewer, GameSnapshot, GameEvent, ws messages
src/shared/avatar.ts              fnv1a hash → avatar index
src/engine/digMath.ts             pure formulas
src/engine/artifacts.ts           catalog + roll
src/engine/digQueue.ts            queued dig jobs
src/engine/roster.ts              viewer presence / on-block / crowd
src/engine/GameEngine.ts          authoritative game loop
src/store/Store.ts                Store interface + SqliteStore
src/sources/normalize.ts          raw connector/TikFinity payload → LiveEvent
src/sources/EventSource.ts        interface + ConnectorSource, TikFinitySource
src/server/hub.ts                 ws protocol, source switching, timers
src/app/control/page.tsx          streamer panel
src/app/game/page.tsx             OBS page (mounts PhaserGame)
src/game/useGameSocket.ts         ws client hook (auto-reconnect)
src/game/PhaserGame.tsx           Phaser mount component
src/game/iso.ts                   isometric math (pure)
src/game/art.ts                   generated placeholder textures
src/game/DigScene.ts              renders snapshot + events
tests/**                          vitest, mirrors src
```

---

### Task 1: Scaffold + shared types + config

**Files:**
- Create: Next app in repo root (`create-next-app`), `src/config/game.ts`, `src/shared/types.ts`, `src/shared/avatar.ts`, `vitest.config.ts`, `tests/shared/avatar.test.ts`
- Modify: `package.json` scripts, `.gitignore` (add `data/`)

**Interfaces — Produces** (`src/shared/types.ts`):
```ts
export type Viewer = { userId: string; uniqueId: string; nickname: string; avatarUrl?: string };
export type LiveEvent =
  | { type: 'like'; user: Viewer; count: number }
  | { type: 'gift'; user: Viewer; giftName: string; diamonds: number; repeat: number }
  | { type: 'join'; user: Viewer }
  | { type: 'chat'; user: Viewer; text: string };
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Biome = typeof import('@/config/game').BIOMES[number];
export type ArtifactDef = { id: string; name: string; biome: Biome; rarity: Rarity };
export type AvatarView = { userId: string; uniqueId: string; avatarIndex: number; bonus: number; crowned: boolean };
export type GameSnapshot = {
  layer: number; depthM: number; biome: Biome; hp: number; maxHp: number; totalDigs: number;
  onBlock: AvatarView[]; crowd: AvatarView[]; crowdOverflow: number; activeCount: number;
  feed: string[];
};
export type GameEvent =
  | { k: 'dig'; userId: string; digs: number; big: boolean }
  | { k: 'layerBroken'; layer: number; biome: Biome }
  | { k: 'artifact'; userId: string; uniqueId: string; artifact: ArtifactDef }
  | { k: 'bag'; uniqueId: string; items: { artifact: ArtifactDef; count: number }[]; bonus: number }
  | { k: 'leaderboard'; rows: { uniqueId: string; score: number; legendaries: number }[] };
export type SourceKind = 'connector' | 'tikfinity';
export type SourceStatus = { kind: SourceKind | null; state: 'idle'|'connecting'|'connected'|'reconnecting'|'error'; error?: string; roomId?: string };
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
```
`avatarIndex(userId: string, count: number): number` uses FNV-1a 32-bit, then `% count`.

- [ ] **Step 1:** `npx create-next-app@latest . --ts --app --src-dir --eslint --tailwind --import-alias "@/*" --use-npm`. Accept that it is non-empty: keep `image*.png`, `docs/`. Then `npm i phaser ws better-sqlite3 tiktok-live-connector` and `npm i -D vitest tsx @types/ws @types/better-sqlite3`.
- [ ] **Step 2:** Scripts: `"dev": "tsx watch server.ts"`, `"start": "NODE_ENV=production tsx server.ts"`, `"test": "vitest run"`. Add `vitest.config.ts` with the `@` alias and node environment.
- [ ] **Step 3:** Write the failing test `tests/shared/avatar.test.ts`. It checks that `avatarIndex('123', 8)` is in `[0,8)`, returns the same value on repeated calls, and that `avatarIndex('a',8)` and `avatarIndex('b',8)` are both deterministic. Also check `avatarIndex('', 8)` does not throw.
- [ ] **Step 4:** Run `npx vitest run tests/shared` → FAIL (module missing).
- [ ] **Step 5:** Write the config, types, and avatar files.
- [ ] **Step 6:** Run `npm test` → PASS. Run `npx tsc --noEmit` → no errors.
- [ ] **Step 7:** Commit `chore: scaffold Next.js app with shared types and config`.

---

### Task 2: Dig math

**Files:** Create `src/engine/digMath.ts`, `tests/engine/digMath.test.ts`

**Interfaces — Produces:**
```ts
likeToDigs(count: number): number                 // max(0, floor(count))
giftToDigs(diamonds: number, repeat: number): number // diamonds*repeat*GIFT_MULTIPLIER, ≥0
giftRolls(digs: number): number                   // min(GIFT_ROLL_CAP, ceil(sqrt(digs))), 0 if digs<=0
layerMaxHp(layer: number): number                 // round(BASE_HP * HP_GROWTH^layer)
biomeForLayer(layer: number): { biome: Biome; cycle: number } // floor(layer/LAYERS_PER_BIOME) mod BIOMES.length; cycle = how many wraps
depthMeters(layer: number): number                // layer*METERS_PER_LAYER
playerBonus(bonusSum: number): number             // min(BONUS_CAP, 1 + bonusSum)
```

- [ ] **Step 1: Failing tests:**
  - `giftToDigs(1,1)===10`
  - `giftToDigs(30000,1)===300000`
  - `giftRolls(10)===4`
  - `giftRolls(300000)===20`
  - `giftRolls(0)===0`
  - `likeToDigs(-3)===0`
  - `layerMaxHp(0)===100`
  - `layerMaxHp(10)===405`
  - `biomeForLayer(0).biome==='grass'`
  - `biomeForLayer(10).biome==='dirt'`
  - `biomeForLayer(70)` deep-equals `{biome:'grass',cycle:1}`
  - `playerBonus(0.5)===1.5`
  - `playerBonus(10)===5`
- [ ] **Step 2:** Run `npx vitest run tests/engine/digMath.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command → PASS.
- [ ] **Step 5:** Commit `feat(engine): dig math formulas`.

---

### Task 3: Artifact catalog + roll

**Files:** Create `src/engine/artifacts.ts`, `tests/engine/artifacts.test.ts`

**Interfaces — Produces:**
```ts
type Rng = () => number   // [0,1)
ARTIFACTS: readonly ArtifactDef[]   // exactly 5 per biome: 2 common, 1 rare, 1 epic, 1 legendary; ids `${biome}-${slug}`; original names (e.g. dirt: "Rusty Spoon", "Old Bottle Cap", "Clay Owl", "Fossil Snail", "Sun Medallion")
rollArtifact(rng: Rng, biome: Biome): ArtifactDef | null
  // one rng() vs DROP_CHANCE_PER_ROLL; on hit, one rng() picks rarity by RARITY_WEIGHTS; one rng() picks uniformly within biome+rarity
findArtifact(id: string): ArtifactDef | undefined
```

- [ ] **Step 1: Failing tests:**
  - Every biome has 5 artifacts with the rarity counts above, and all ids are unique.
  - With an rng sequence `[0.5]`, `rollArtifact` returns `null`.
  - With `[0.0, 0.0, 0.0]` it returns a `common` of that biome.
  - With `[0.0, 0.999, 0.0]` it returns a `legendary`.
  - Run 100k rolls with `Math.random` on `stone`. The hit rate is within 0.02 ± 0.003.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(engine): artifact catalog and drop roll`.

---

### Task 4: Dig queue + viewer roster

**Files:** Create `src/engine/digQueue.ts`, `src/engine/roster.ts`, `tests/engine/digQueue.test.ts`, `tests/engine/roster.test.ts`

**Interfaces — Produces:**
```ts
type DigJob = { userId: string; digs: number; rolls: number; big: boolean };
class DigQueue { push(job: DigJob): void; drainAll(): DigJob[]; get size(): number }  // FIFO

class Roster {
  touch(v: Viewer, now: number, opts?: { active?: boolean; crown?: boolean }): void
    // join → touch without active; like/gift → active; crown sets crownedUntil = now + CROWN_MS
  setBonus(userId: string, bonus: number): void
  get(userId: string): { viewer: Viewer; bonus: number } | undefined
  view(now: number): Pick<GameSnapshot,'onBlock'|'crowd'|'crowdOverflow'|'activeCount'>
    // onBlock = viewers with lastActiveAt >= now-ACTIVE_WINDOW_MS, most recent first, max MAX_ON_BLOCK
    // crowd = everyone else, most recently seen first, max MAX_CROWD; crowdOverflow = remaining count
  clear(): void
}
```
`AvatarView.avatarIndex` = `avatarIndex(userId, GAME.AVATAR_COUNT)` (constant lives in config so the server never imports client code).

- [ ] **Step 1: Failing tests:**
  - The queue is FIFO and `drainAll` empties it.
  - Roster with 15 active viewers gives `onBlock.length===12`. The 3 oldest-active go to the crowd.
  - A viewer active at t=0 is on the block at t=14_999 and in the crowd at t=15_001.
  - 40 joined but inactive viewers give `crowd.length===20` and `crowdOverflow===20`.
  - Crown is true until `CROWN_MS` has passed.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(engine): dig queue and viewer roster`.

---

### Task 5: SQLite store

**Files:** Create `src/store/Store.ts`, `tests/store/Store.test.ts`

**Interfaces — Produces:**
```ts
type SessionRow = { roomId: string | null; layer: number; hp: number; totalDigs: number };
interface Store {
  upsertViewer(v: Viewer): void;
  addArtifact(userId: string, a: ArtifactDef, layer: number): void;
  bonusSum(userId: string): number;                         // Σ RARITY_BONUS over owned artifacts
  bag(userId: string): { artifact: ArtifactDef; count: number }[];
  findUserIdByUniqueId(uniqueId: string): string | undefined;
  leaderboard(limit: number): { uniqueId: string; score: number; legendaries: number }[];
     // score = Σ RARITY_BONUS*100, order score desc
  loadSession(): SessionRow | null;
  saveSession(s: SessionRow): void;
}
class SqliteStore implements Store { constructor(file: string) }  // ':memory:' for tests; creates tables + WAL
```
Tables:
- `viewers(user_id TEXT PK, unique_id, nickname, avatar_url, updated_at)`
- `artifacts(id INTEGER PK, user_id, artifact_id, rarity, layer, found_at)` with an index on `user_id`
- `session(id INTEGER PK CHECK(id=1), room_id, layer, hp, total_digs, updated_at)`

The production file is `data/game.db`. Create the dir if it is missing.

- [ ] **Step 1: Failing tests (`:memory:`):**
  - Add 1 epic + 2 common gives `bonusSum` of `0.10` (toBeCloseTo).
  - `bag` groups counts.
  - `upsertViewer`, then upsert again with a new uniqueId. `findUserIdByUniqueId(new)` returns the same userId, and the bag is preserved.
  - `saveSession`/`loadSession` round-trip.
  - `loadSession()` on an empty DB is `null`.
  - Leaderboard is ordered by score.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with prepared statements.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(store): sqlite persistence for viewers, artifacts, session`.

---

### Task 6: GameEngine

**Files:** Create `src/engine/GameEngine.ts`, `tests/engine/GameEngine.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
```ts
class GameEngine {
  constructor(deps: { store: Store; rng: () => number; now: () => number });
  handle(e: LiveEvent): void;            // enqueue / roster / chat commands; never throws
  tick(): GameEvent[];                   // called every TICK_MS by hub
  snapshot(): GameSnapshot;
  startSession(roomId: string | null): void; // same roomId as saved → resume; different (incl. null→id) → reset
  newLive(): void;                       // reset layer 0, hp=max, totalDigs 0, roster.clear(), keep roomId
  persist(): void;                       // store.saveSession(current)
  maybeLeaderboard(): GameEvent | null;  // every LEADERBOARD_INTERVAL_MS
}
```
Behavior:
- `like` → `store.upsertViewer`, `roster.touch(active)`, then push `{digs: likeToDigs(count), rolls: same, big:false}`. Skip if digs is 0.
- `gift` → digs = `giftToDigs`, rolls = `giftRolls(digs)`, `big = digs >= BIG_GIFT_DIGS` (crown when big). Feed line: `🎁 @{uniqueId} ส่ง {giftName} → +{digs} ขุด`.
- `join` → touch (not active). Feed: `👋 @{uniqueId} เข้ามาแล้ว`.
- `chat` with text trimmed and lowercased `=== '!bag'`. The next `tick()` emits a `bag` event for that user, with bonus `playerBonus(bonusSum)`.
- `tick()` drains the whole queue. For each job:
  1. damage = `digs * BASE_DAMAGE * playerBonus(bonusSum(userId))`. Cache bonusSum in the roster and refresh it on artifact gain.
  2. Apply damage. While damage ≥ hp: subtract hp, `layer++`, `hp = layerMaxHp(layer)`, emit `layerBroken`. Otherwise subtract.
  3. Do `rolls` × `rollArtifact(rng, current biome)`. On a hit: `store.addArtifact`, refresh the bonus, emit `artifact`, and add feed line `✨ @{uniqueId} ได้ {name} ({rarity})!`.

  Emit `dig` events only for the first `MAX_DIG_EVENTS_PER_TICK` jobs. Feed is capped at `FEED_MAX`, newest first. Like feed lines `❤ @{uniqueId} x{count}` are coalesced per user per tick.

- [ ] **Step 1: Failing tests** (in-memory store, scripted rng that never drops unless stated, fake clock):
  - A like of 5 followed by `tick()` gives `hp === 95` and `totalDigs === 5`.
  - Gift Rose (1💎) gives 10 digs.
  - Whale (Review Focus 2): a gift of 30,000💎 in one tick leaves `layer > 0`, layerBroken events equal to the layer delta, `dig` events ≤ 3, and rng called for drops exactly 20 times. Finishes in under 50 ms (`performance.now`).
  - A user with an epic artifact pre-seeded has a like of 10 deal `10.8` damage (bonus 1.08).
  - Bonus cap: seed 30 legendaries, a like of 1 deals 5.
  - An rng that always hits makes the artifact belong to the job's userId, and `store.bag` has it.
  - `!bag` chat makes the next tick contain `{k:'bag'}` for that user.
  - Session (Review Focus 4):
    - `startSession('A')`, dig to layer 2, `persist()`. Make a new engine with the same store and call `startSession('A')`, giving layer 2.
    - `startSession('B')` gives layer 0.
    - `newLive()` gives layer 0 and an empty roster.
  - `handle` with a like count of 0 or NaN does not throw and leaves the queue empty.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` → all PASS.
- [ ] **Step 5:** Commit `feat(engine): authoritative game engine with artifacts and sessions`.

---

### Task 7: Event sources (normalize + Connector + TikFinity)

**Files:** Create `src/sources/normalize.ts`, `src/sources/EventSource.ts`, `tests/sources/normalize.test.ts`, `tests/sources/fixtures.ts`

**Interfaces — Produces:**
```ts
normalizeUser(raw: any): Viewer | null     // accepts v1 flat {userId, uniqueId, nickname, profilePictureUrl}
                                           // and v2 nested {user:{userId, uniqueId, nickname, profilePicture:{urls:[...]}}}
                                           // userId missing → `u:${uniqueId}`; both missing → null; nickname '' → uniqueId
normalizeLike(raw): LiveEvent | null       // likeCount ≤0 → null
normalizeGift(raw): LiveEvent | null       // giftType===1 && !repeatEnd → null (streak in progress);
                                           // diamonds from diamondCount ?? giftDetails.diamondCount; repeat from repeatCount ?? 1
normalizeJoin(raw), normalizeChat(raw)     // chat text from comment
normalizeTikFinity(msg: {event: string; data: any}): LiveEvent | null
                                           // event 'like'|'gift'|'member'|'chat' → the above
interface EventSource {
  readonly kind: SourceKind;
  start(onEvent: (e: LiveEvent) => void, onStatus: (s: SourceStatus) => void): Promise<void>;
  stop(): Promise<void>;
}
class ConnectorSource implements EventSource { constructor(opts: { username: string; signApiKey?: string }) }
class TikFinitySource implements EventSource { constructor(opts: { url: string }) }  // default ws://localhost:21213/
```
Adapter rules:
- **ConnectorSource** uses `TikTokLiveConnection` from `tiktok-live-connector`. Pass `signApiKey` when given (check the installed version's README for the exact option name and pin the version in `package.json`). Wire `like`, `gift`, `member`, `chat`. Report `roomId` in status on connect.
- On `disconnected` or `streamEnd` → status `reconnecting`, then retry with backoff 2 s, 4 s, 8 s… up to a 30 s cap until `stop()` is called.
- **TikFinitySource** opens a `ws` client and does `JSON.parse` in try/catch, dropping bad frames. It uses the same reconnect backoff. It has no roomId, so it reports `roomId: undefined`. Sessions under TikFinity reset only via `newLive`.

- [ ] **Step 1: Write fixtures** with realistic v1 and v2 payloads for like, gift (streak mid, streak end, non-streak), member and chat. Add a TikFinity envelope and one with no userId.
- [ ] **Step 2: Failing tests:**
  - Streak mid gives `null`, and streak end with `repeatCount:10, diamondCount:1` gives a gift with `diamonds 1, repeat 10` (Review Focus 1).
  - A non-streak gift (`giftType 2`) counts immediately.
  - v1 and v2 like give an equal `LiveEvent`.
  - No userId gives `userId === 'u:<uniqueId>'`.
  - No user at all gives `null`.
  - TikFinity `member` gives `join`.
  - Unknown TikFinity event gives `null`.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement the normalizers and both adapters. The adapters are not unit-tested and get a manual check in Task 10.
- [ ] **Step 5:** Run → PASS. Run `npx tsc --noEmit` clean.
- [ ] **Step 6:** Commit `feat(sources): connector and TikFinity adapters with payload normalization`.

---

### Task 8: Server + ws hub

**Files:** Create `server.ts`, `src/server/hub.ts`, `tests/server/hub.test.ts`

**Interfaces:**
- Consumes: `GameEngine`, `EventSource` impls, `SqliteStore`, `ServerMsg`/`ClientMsg`.
- Produces:
```ts
class Hub {
  constructor(deps: { engine: GameEngine; makeSource: (m: Extract<ClientMsg,{t:'connect'}>) => EventSource });
  attach(ws: WebSocketLike): void;   // send snapshot + current status immediately; route ClientMsg; ignore malformed
  tick(): void;                       // engine.tick() (+maybeLeaderboard) → broadcast events (if any) + snapshot
  stopAll(): Promise<void>;
}
type WebSocketLike = { send(data: string): void; on(ev: 'message'|'close', cb: (d?: any) => void): void; readyState: number };
```
- `connect` stops the current source first (one at a time), then starts the new one. On a status with `roomId`, call `engine.startSession(roomId)`.
- `mock` → `engine.handle(event)`.
- `newLive` → `engine.newLive()`.
- `server.ts`:
  1. Run `next({ dev })` and serve it with `http.createServer`.
  2. Create `WebSocketServer({ noServer: true })` and route `upgrade` for path `/ws` to it. Pass other upgrades to Next's upgrade handler so HMR keeps working.
  3. Make the store `new SqliteStore('data/game.db')`. Make the engine with `Math.random`/`Date.now`, then `engine.startSession(store.loadSession()?.roomId ?? null)`.
  4. Start `setInterval(hub.tick, TICK_MS)` and `setInterval(engine.persist, SAVE_INTERVAL_MS)`.
  5. On SIGINT: call persist, then `hub.stopAll()`.
- Port is `PORT ?? 3000`.

- [ ] **Step 1: Failing tests** (fake ws objects collecting `send` strings, and a fake source):
  - `attach` sends `snapshot` and `status` immediately (Review Focus 3).
  - A second client attached after 5 digs sees `totalDigs === 5`.
  - `{t:'mock', event: like 3}` followed by `tick()` makes all clients receive `events` with a `dig`.
  - A non-JSON message or unknown `t` neither throws nor sends (Review Focus 5).
  - Connecting source B while A is running calls `A.stop()` once before `B.start()`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `hub.ts` and `server.ts`.
- [ ] **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Run `npm run dev`, then `node -e` a ws client to `ws://localhost:3000/ws` and see the snapshot JSON printed. Stop the server.
- [ ] **Step 6:** Commit `feat(server): custom Next server with ws hub and game loop`.

---

### Task 9: `/control` page + ws hook

**Files:** Create `src/game/useGameSocket.ts`, `src/app/control/page.tsx`. Modify `src/app/page.tsx` so it links to `/control` and `/game`.

**Interfaces — Produces:**
```ts
useGameSocket(): { snapshot: GameSnapshot | null; status: SourceStatus | null;
                   onEvents(cb: (e: GameEvent[]) => void): () => void; send(m: ClientMsg): void; connected: boolean }
// connects to `${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`, reconnects every 1 s on close
```
Control UI (Tailwind, Thai labels):
- Source radio: Connector (Euler) / TikFinity.
- Fields: TikTok username and Euler API key (optional), or TikFinity URL defaulting to `ws://localhost:21213/`.
- Buttons: Connect, Disconnect, and "เริ่มไลฟ์ใหม่" (asks `confirm()` first).
- Status pill and current depth, layer and active count.
- Mock panel: a username input (default random `tester{n}`) and buttons:
  - ❤ ×1, ❤ ×15
  - Rose (1💎), Galaxy (1000💎), Whale (30000💎)
  - Join, `!bag`

  Each button sends `{t:'mock', event}` with `userId = 'mock:' + username`.
- Remember the last inputs in `localStorage` (try/catch).

- [ ] **Step 1:** Implement the hook and page.
- [ ] **Step 2:** Run `npm run dev` and open `/control`. Click ❤ ×15 and confirm that "ขุดทั้งหมด" increases. Click Whale and confirm the layer jumps and the page stays responsive.
- [ ] **Step 3:** Commit `feat(control): streamer control panel with mock events`.

---

### Task 10: `/game` Phaser renderer

**Files:** Create `src/game/iso.ts`, `tests/game/iso.test.ts`, `src/game/art.ts`, `src/game/DigScene.ts`, `src/game/PhaserGame.tsx`, `src/app/game/page.tsx`

**Interfaces:**
- Consumes: `useGameSocket`, `GameSnapshot`, `GameEvent`, `BIOMES`, `ARTIFACTS`.
- Produces:
```ts
// iso.ts
isoToScreen(x: number, y: number, z: number, tileW: number, tileH: number): { sx: number; sy: number }
   // sx = (x - y) * tileW/2 ; sy = (x + y) * tileH/2 - z
biomePalette(biome: Biome, cycle: number): { top: number; left: number; right: number; dirt: number }
   // each cycle darkens by 12% per wrap, floor 40%
// DigScene
class DigScene extends Phaser.Scene { applySnapshot(s: GameSnapshot): void; applyEvents(e: GameEvent[]): void }
```
Layout on 1080×1920, top to bottom, as in spec §6.6:
1. Top bar (y 0–110): total digs, active count, depth in m.
2. Layer list on the left (x 24, y 140): the 7 biome names in Thai, with the current one highlighted.
3. Iso block centered (x 540, y ~760): a 6×6 tile top with 2 visible side faces in palette colors and the current biome texture tint. Shift the block down a few px with a short tween on `layerBroken`, plus a white flash.
4. On-block avatars are placed on top tiles (deterministic slot from avatarIndex+userId). They play a dig swing tween, and `@uniqueId` (and `×{bonus.toFixed(1)}` when >1) shows above. Crowned avatars are scale 1.5 with a 👑 sprite.
5. HP bar (y ~1260) with the biome name and `hp/maxHp` compacted (`12.3K`).
6. Crowd row (y ~1380): up to 20 small avatars and a `+N` label.
7. Feed (y ~1560–1820): the last 6 lines.
8. Permanent how-to line at the bottom: `❤ = ขุด 1  |  🎁 = ขุดคูณ  |  พิมพ์ !bag ดูของสะสม`.

Events:
- `dig` → spawn dirt particles in `palette.dirt` at the digger's tile: 6 particles, or 20 when `big`. If `big`, also show combo text `+{digs}` that scales up and fades.
- `artifact` → centered card popup. It glows in the rarity color (common #b0bec5, rare #42a5f5, epic #ab47bc, legendary #ffca28) with the caption `@{uniqueId} ได้ {name}!`, shown for 2.5 s. Legendary also gets `cameras.main.shake(400, 0.01)` and a firework particle burst.
- `bag` → an overlay grid of item icons with counts and the bonus, shown for `BAG_SHOW_MS`.
- `leaderboard` → a top-5 overlay for 6 s.

Performance budget: a global particle cap of 300 live particles, using pooled emitters. Avatars are pooled by userId and destroyed when they are gone from the snapshot.

`art.ts` generates all textures in `preload()` with `Graphics.generateTexture`, so there are no external assets:
- 8 avatar variants (body color, hat shape, eye style; 16×20 pixels scaled 4×)
- 1 tile per biome
- 1 dirt pixel
- 1 crown
- 1 icon per artifact rarity shape

They must be original simple shapes, not modeled on any existing game's characters.

- [ ] **Step 1: Failing tests** `tests/game/iso.test.ts`:
  - `isoToScreen(0,0,0,64,32)` gives `{sx:0, sy:0}`.
  - `isoToScreen(1,0,0,64,32)` gives `{sx:32, sy:16}`.
  - `isoToScreen(0,1,10,64,32)` gives `{sx:-32, sy:6}`.
  - `biomePalette('grass',1).top` is less than `biomePalette('grass',0).top` per channel. Compare via `Phaser.Display.Color.IntegerToRGB` or own unpack.
- [ ] **Step 2:** Run → FAIL. Implement `iso.ts`. Run → PASS.
- [ ] **Step 3:** Implement `art.ts`, `DigScene.ts`, `PhaserGame.tsx` (creates `Phaser.Game` once, destroys it on unmount, forwards snapshot/events into the scene) and `app/game/page.tsx` (`dynamic(..., {ssr:false})`, full-viewport black background).
- [ ] **Step 4: Manual verification:**
  1. Open `/game` and `/control` side by side.
  2. Send mock ❤, Galaxy and Whale. Confirm dirt flies, avatars jump onto the block and drop to the crowd after 15 s, and the HP bar and depth update.
  3. Force a drop by temporarily setting `DROP_CHANCE_PER_ROLL: 1` locally (revert after) to see the artifact popup and the legendary shake.
  4. Refresh `/game` mid-session and confirm the depth is unchanged.
  5. Record FPS via `game.loop.actualFps` in an on-screen debug text, toggled by `?debug=1`. Under Whale spam it should be ≥ 55.
- [ ] **Step 5:** Commit `feat(game): Phaser isometric dig renderer`.

---

### Task 11: End-to-end check + README

**Files:** Create `README.md` (Thai). Modify nothing else unless a fix is needed.

The README covers:
- install and `npm run dev`
- adding an OBS/TikTok Live Studio Browser Source at `http://localhost:3000/game`, 1080×1920
- using `/control`
- the Euler API key note (rate limits)
- TikFinity setup (enable its WebSocket API, default `ws://localhost:21213/`)
- tuning `src/config/game.ts`
- where data lives (`data/game.db`)

- [ ] **Step 1:** Run `npm test && npx tsc --noEmit && npm run build` and expect all green.
- [ ] **Step 2:** Live smoke test (needs a real live username, can be someone else's public live):
  1. Connect via Connector and see the status `connected` with a roomId.
  2. Watch real likes dig.
  3. Disconnect, then connect via TikFinity if it is installed.
  4. If it isn't installed, record that it was not verified.
- [ ] **Step 3:** Restart the server mid-session and confirm depth resumes for the same room.
- [ ] **Step 4:** Commit `docs: setup and streaming guide`.
