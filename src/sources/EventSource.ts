import WebSocket from 'ws';
import type { LiveEvent, SourceKind, SourceStatus } from '@/shared/types';
import { normalizeChat, normalizeGift, normalizeJoin, normalizeLike, normalizeTikFinity } from './normalize';

export type OnEvent = (e: LiveEvent) => void;
export type OnStatus = (s: SourceStatus) => void;

export interface EventSource {
  readonly kind: SourceKind;
  start(onEvent: OnEvent, onStatus: OnStatus): Promise<void>;
  stop(): Promise<void>;
}

const BACKOFF_START_MS = 2_000;
const BACKOFF_MAX_MS = 30_000;

/** Shared reconnect-with-backoff loop. Subclasses implement one connect attempt. */
abstract class ReconnectingSource implements EventSource {
  abstract readonly kind: SourceKind;
  protected stopped = false;
  private timer: NodeJS.Timeout | null = null;
  private backoff = BACKOFF_START_MS;
  protected onEvent: OnEvent = () => {};
  protected onStatus: OnStatus = () => {};

  async start(onEvent: OnEvent, onStatus: OnStatus): Promise<void> {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.stopped = false;
    this.status('connecting');
    await this.attempt();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.close().catch(() => {});
    this.status('idle');
  }

  protected status(state: SourceStatus['state'], extra: Partial<SourceStatus> = {}): void {
    this.onStatus({ kind: this.kind, state, ...extra });
  }

  protected connected(roomId?: string): void {
    this.backoff = BACKOFF_START_MS;
    this.status('connected', { roomId });
  }

  protected scheduleReconnect(error?: string): void {
    if (this.stopped || this.timer) return;
    this.status('reconnecting', error ? { error } : {});
    const wait = this.backoff;
    this.backoff = Math.min(BACKOFF_MAX_MS, this.backoff * 2);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped) void this.attempt();
    }, wait);
  }

  protected emit(e: LiveEvent | null): void {
    if (e) this.onEvent(e);
  }

  private async attempt(): Promise<void> {
    try {
      await this.open();
    } catch (err) {
      this.scheduleReconnect(err instanceof Error ? err.message : String(err));
    }
  }

  protected abstract open(): Promise<void>;
  protected abstract close(): Promise<void>;
}

/** The slice of TikTokLiveConnection we use; lets tests inject a fake. */
export type LiveConn = {
  on(ev: string, cb: (d: unknown) => void): unknown;
  connect(): Promise<{ roomId: string | number }>;
  disconnect(): Promise<void>;
  removeAllListeners?(): unknown;
};
type ConnFactory = (username: string, signApiKey?: string) => LiveConn | Promise<LiveConn>;

const realConn: ConnFactory = async (username, signApiKey) => {
  const { TikTokLiveConnection } = await import('tiktok-live-connector');
  return new TikTokLiveConnection(username, { ...(signApiKey ? { signApiKey } : {}) }) as unknown as LiveConn;
};

/** tiktok-live-connector (signing via Euler Stream). Event names match WebcastEvent/ControlEvent values. */
export class ConnectorSource extends ReconnectingSource {
  readonly kind = 'connector' as const;
  private conn: LiveConn | null = null;

  constructor(private opts: { username: string; signApiKey?: string }, private makeConn: ConnFactory = realConn) {
    super();
  }

  protected async open(): Promise<void> {
    await this.close();
    const conn = await this.makeConn(this.opts.username, this.opts.signApiKey);
    if (this.stopped) return;
    this.conn = conn;
    const mine = () => this.conn === conn && !this.stopped;
    conn.on('like', (d) => mine() && this.emit(normalizeLike(d)));
    conn.on('gift', (d) => mine() && this.emit(normalizeGift(d)));
    conn.on('member', (d) => mine() && this.emit(normalizeJoin(d)));
    conn.on('chat', (d) => mine() && this.emit(normalizeChat(d)));
    conn.on('disconnected', () => { if (mine()) this.scheduleReconnect('disconnected'); });
    conn.on('streamEnd', () => { if (mine()) this.scheduleReconnect('stream ended'); });
    conn.on('error', (err) => console.error('[connector]', err));
    const state = await conn.connect();
    // stop() (or a newer attempt) may have happened while we were connecting: don't leak this one.
    if (!mine()) {
      conn.removeAllListeners?.();
      await conn.disconnect().catch(() => {});
      return;
    }
    this.connected(String(state.roomId));
  }

  protected async close(): Promise<void> {
    const c = this.conn;
    this.conn = null;
    if (c) {
      c.removeAllListeners?.();
      await c.disconnect().catch(() => {});
    }
  }
}

/** TikFinity desktop app WebSocket API (default ws://localhost:21213/). No third-party signing. */
export class TikFinitySource extends ReconnectingSource {
  readonly kind = 'tikfinity' as const;
  private ws: WebSocket | null = null;

  constructor(private opts: { url: string }) {
    super();
  }

  protected open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.opts.url || 'ws://localhost:21213/');
      this.ws = ws;
      let opened = false;
      ws.on('open', () => {
        opened = true;
        this.connected(undefined);
        resolve();
      });
      ws.on('message', (data) => {
        try {
          this.emit(normalizeTikFinity(JSON.parse(String(data))));
        } catch {
          /* drop malformed frame */
        }
      });
      ws.on('error', (err) => {
        if (!opened) reject(err);
      });
      ws.on('close', () => {
        if (this.ws === ws && opened) this.scheduleReconnect('closed');
      });
    });
  }

  protected async close(): Promise<void> {
    const ws = this.ws;
    this.ws = null;
    ws?.removeAllListeners('close');
    ws?.close();
  }
}
