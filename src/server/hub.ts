import type { GameEngine } from '@/engine/GameEngine';
import type { EventSource } from '@/sources/EventSource';
import type { ClientMsg, GameEvent, ServerMsg, SourceStatus } from '@/shared/types';

export type WebSocketLike = {
  send(data: string): void;
  on(ev: 'message' | 'close' | 'error', cb: (d?: unknown) => void): void;
  readyState: number;
};
type ConnectMsg = Extract<ClientMsg, { t: 'connect' }>;
type Deps = { engine: GameEngine; makeSource: (m: ConnectMsg) => EventSource };

const OPEN = 1;

/** Connects browsers (/game, /control) to the engine and owns the single active live source. */
export class Hub {
  private clients = new Set<WebSocketLike>();
  private source: EventSource | null = null;
  private status: SourceStatus = { kind: null, state: 'idle' };
  private switching: Promise<void> = Promise.resolve();

  constructor(private deps: Deps) {}

  /** `canControl` = this socket may send commands (control panel). OBS /game sockets are read-only. */
  attach(ws: WebSocketLike, canControl = false): void {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    // Without a listener, ws re-throws protocol errors (bad UTF-8, oversize frame) and kills the process.
    ws.on('error', () => this.clients.delete(ws));
    if (canControl) ws.on('message', (d) => this.onMessage(d));
    this.sendTo(ws, { t: 'snapshot', s: this.deps.engine.snapshot() });
    this.sendTo(ws, { t: 'status', s: this.status });
  }

  tick(): void {
    const { engine } = this.deps;
    const events: GameEvent[] = engine.tick();
    const lb = engine.maybeLeaderboard();
    if (lb) events.push(lb);
    if (events.length) this.broadcast({ t: 'events', e: events });
    this.broadcast({ t: 'snapshot', s: engine.snapshot() });
  }

  async stopAll(): Promise<void> {
    await this.switchSource(null);
  }

  private onMessage(data: unknown): void {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'mock':
        if (msg.event && typeof msg.event === 'object') this.deps.engine.handle(msg.event);
        return;
      case 'newLive':
        this.deps.engine.newLive();
        return;
      case 'connect':
        void this.switchSource(msg);
        return;
      case 'disconnect':
        void this.switchSource(null);
        return;
    }
  }

  /** Serialized so rapid connect clicks never leave two sources running. */
  private switchSource(msg: ConnectMsg | null): Promise<void> {
    this.switching = this.switching.then(async () => {
      if (this.source) {
        const old = this.source;
        this.source = null;
        await old.stop().catch((e) => console.error('[hub] stop failed', e));
      }
      this.setStatus({ kind: null, state: 'idle' });
      if (!msg) return;
      const src = this.deps.makeSource(msg);
      this.source = src;
      // Not awaited: a slow first connect must not block a following Disconnect/Connect click.
      void src
        .start(
          (e) => { if (this.source === src) this.deps.engine.handle(e); },
          (s) => { if (this.source === src) this.onSourceStatus(s); },
        )
        .catch((e) => this.setStatus({ kind: msg.kind, state: 'error', error: String(e) }));
    });
    return this.switching;
  }

  private onSourceStatus(s: SourceStatus): void {
    if (s.state === 'connected' && s.roomId) this.deps.engine.startSession(s.roomId);
    this.setStatus(s);
  }

  private setStatus(s: SourceStatus): void {
    this.status = s;
    this.broadcast({ t: 'status', s });
  }

  private broadcast(m: ServerMsg): void {
    const data = JSON.stringify(m);
    for (const ws of this.clients) if (ws.readyState === OPEN) ws.send(data);
  }

  private sendTo(ws: WebSocketLike, m: ServerMsg): void {
    if (ws.readyState === OPEN) ws.send(JSON.stringify(m));
  }
}
