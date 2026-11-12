import { describe, it, expect, beforeEach } from 'vitest';
import { Hub, type WebSocketLike } from '@/server/hub';
import { GameEngine } from '@/engine/GameEngine';
import { SqliteStore } from '@/store/Store';
import type { EventSource, OnEvent, OnStatus } from '@/sources/EventSource';
import type { ClientMsg, ServerMsg, SourceKind } from '@/shared/types';

class FakeWs implements WebSocketLike {
  readyState = 1;
  sent: ServerMsg[] = [];
  private handlers: Record<string, ((d?: unknown) => void)[]> = {};
  send(data: string) { this.sent.push(JSON.parse(data)); }
  on(ev: 'message' | 'close' | 'error', cb: (d?: unknown) => void) { (this.handlers[ev] ??= []).push(cb); }
  emit(ev: 'message' | 'close' | 'error', d?: unknown) { this.handlers[ev]?.forEach((h) => h(d)); }
  listeners(ev: string) { return this.handlers[ev]?.length ?? 0; }
  client(msg: ClientMsg | string) { this.emit('message', typeof msg === 'string' ? msg : JSON.stringify(msg)); }
  last<T extends ServerMsg['t']>(t: T) {
    return this.sent.filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t).at(-1);
  }
}

class FakeSource implements EventSource {
  log: string[];
  onEvent: OnEvent = () => {};
  onStatus: OnStatus = () => {};
  constructor(readonly kind: SourceKind, log: string[]) { this.log = log; }
  async start(e: OnEvent, s: OnStatus) { this.log.push(`start:${this.kind}`); this.onEvent = e; this.onStatus = s; }
  async stop() { this.log.push(`stop:${this.kind}`); }
}

let hub: Hub;
let engine: GameEngine;
let log: string[];
let sources: FakeSource[];
beforeEach(() => {
  engine = new GameEngine({ store: new SqliteStore(':memory:'), rng: () => 0.99, now: () => 0 });
  engine.startSession(null);
  log = [];
  sources = [];
  hub = new Hub({
    engine,
    makeSource: (m) => { const s = new FakeSource(m.kind, log); sources.push(s); return s; },
  });
});

const user = { userId: '42', uniqueId: 'nong', nickname: 'Nong' };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Hub', () => {
  it('sends snapshot and status immediately on attach', () => {
    const ws = new FakeWs();
    hub.attach(ws, true);
    expect(ws.last('snapshot')?.s.layer).toBe(0);
    expect(ws.last('status')?.s.state).toBe('idle');
  });
  it('a late client sees the current state (OBS refresh)', () => {
    const a = new FakeWs();
    hub.attach(a, true);
    a.client({ t: 'mock', event: { type: 'like', user, count: 5 } });
    hub.tick();
    const b = new FakeWs();
    hub.attach(b);
    expect(b.last('snapshot')?.s.totalDigs).toBe(5);
  });
  it('broadcasts dig events to every client', () => {
    const a = new FakeWs(); const b = new FakeWs();
    hub.attach(a, true); hub.attach(b);
    a.client({ t: 'mock', event: { type: 'like', user, count: 3 } });
    hub.tick();
    for (const ws of [a, b]) expect(ws.last('events')?.e.some((e) => e.k === 'dig')).toBe(true);
  });
  it('ignores malformed messages', () => {
    const ws = new FakeWs();
    hub.attach(ws);
    const before = ws.sent.length;
    expect(() => { ws.client('not json'); ws.client(JSON.stringify({ t: 'bogus' })); ws.emit('message', undefined); }).not.toThrow();
    expect(ws.sent.length).toBe(before);
  });
  it('stops the running source before starting another', async () => {
    const ws = new FakeWs();
    hub.attach(ws, true);
    ws.client({ t: 'connect', kind: 'connector', username: 'x' });
    await flush();
    ws.client({ t: 'connect', kind: 'tikfinity', url: 'ws://localhost:21213/' });
    await flush();
    expect(log).toEqual(['start:connector', 'stop:connector', 'start:tikfinity']);
  });
  it('routes source events into the engine and starts a session on roomId', async () => {
    const ws = new FakeWs();
    hub.attach(ws, true);
    ws.client({ t: 'connect', kind: 'connector', username: 'x' });
    await flush();
    sources[0].onEvent({ type: 'like', user, count: 4 });
    hub.tick();
    expect(engine.snapshot().totalDigs).toBe(4);
    sources[0].onStatus({ kind: 'connector', state: 'connected', roomId: 'R9' });
    expect(engine.snapshot().totalDigs).toBe(0); // new room → fresh live
    expect(ws.last('status')?.s.roomId).toBe('R9');
  });
  it('newLive resets depth', () => {
    const ws = new FakeWs();
    hub.attach(ws, true);
    ws.client({ t: 'mock', event: { type: 'like', user, count: 300 } });
    hub.tick();
    ws.client({ t: 'newLive' });
    hub.tick();
    expect(ws.last('snapshot')?.s.layer).toBe(0);
  });
  it('does not send to closed sockets', () => {
    const ws = new FakeWs();
    hub.attach(ws);
    ws.emit('close');
    const n = ws.sent.length;
    hub.tick();
    expect(ws.sent.length).toBe(n);
  });
  it('registers an error handler so a bad frame cannot crash the server', () => {
    const ws = new FakeWs();
    hub.attach(ws);
    expect(ws.listeners('error')).toBeGreaterThan(0);
    expect(() => ws.emit('error', new Error('WS_ERR_INVALID_UTF8'))).not.toThrow();
  });
  it('ignores control messages from read-only clients', async () => {
    const viewer = new FakeWs();
    hub.attach(viewer, false);
    viewer.client({ t: 'mock', event: { type: 'like', user, count: 300 } });
    viewer.client({ t: 'connect', kind: 'connector', username: 'x' });
    await flush();
    hub.tick();
    expect(engine.snapshot().totalDigs).toBe(0);
    expect(log).toEqual([]);
  });
  it('clamps absurd mock counts', () => {
    const ws = new FakeWs();
    hub.attach(ws, true);
    ws.client({ t: 'mock', event: { type: 'like', user, count: 1e300 } });
    ws.client({ t: 'mock', event: { type: 'gift', user, giftName: 'x', diamonds: 1e300, repeat: 1e9 } });
    hub.tick();
    const s = engine.snapshot();
    expect(Number.isFinite(s.hp)).toBe(true);
    expect(Number.isFinite(s.maxHp)).toBe(true);
  });
});

describe('Hub source switching', () => {
  it('disconnect is not blocked by a source whose start never resolves', async () => {
    const order: string[] = [];
    const hanging = {
      kind: 'connector' as const,
      start: () => { order.push('start'); return new Promise<void>(() => {}); },
      stop: async () => { order.push('stop'); },
    };
    const engine = new GameEngine({ store: new SqliteStore(':memory:'), rng: () => 0.99, now: () => 0 });
    const hub = new Hub({ engine, makeSource: () => hanging });
    const ws = new FakeWs();
    hub.attach(ws, true);
    ws.client({ t: 'connect', kind: 'connector', username: 'x' });
    await flush();
    ws.client({ t: 'disconnect' });
    await flush(); await flush();
    expect(order).toEqual(['start', 'stop']);
    expect(ws.last('status')?.s.state).toBe('idle');
  });
});
