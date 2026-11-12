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

/** tiktok-live-connector (signing via Euler Stream). */
export class ConnectorSource extends ReconnectingSource {
  readonly kind = 'connector' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private conn: any = null;

  constructor(private opts: { username: string; signApiKey?: string }) {
    super();
  }

  protected async open(): Promise<void> {
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector');
    await this.close();
    const conn = new TikTokLiveConnection(this.opts.username, {
      ...(this.opts.signApiKey ? { signApiKey: this.opts.signApiKey } : {}),
    });
    this.conn = conn;
    conn.on(WebcastEvent.LIKE, (d: unknown) => this.emit(normalizeLike(d)));
    conn.on(WebcastEvent.GIFT, (d: unknown) => this.emit(normalizeGift(d)));
    conn.on(WebcastEvent.MEMBER, (d: unknown) => this.emit(normalizeJoin(d)));
    conn.on(WebcastEvent.CHAT, (d: unknown) => this.emit(normalizeChat(d)));
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.conn === conn) this.scheduleReconnect('disconnected');
    });
    conn.on(WebcastEvent.STREAM_END, () => {
      if (this.conn === conn) this.scheduleReconnect('stream ended');
    });
    conn.on(ControlEvent.ERROR, (err: unknown) => console.error('[connector]', err));
    const state = await conn.connect();
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
