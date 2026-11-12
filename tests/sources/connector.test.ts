import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { ConnectorSource } from '@/sources/EventSource';
import type { SourceStatus } from '@/shared/types';

class FakeConn extends EventEmitter {
  disconnects = 0;
  resolveConnect!: (s: { roomId: string }) => void;
  connect() { return new Promise<{ roomId: string }>((r) => { this.resolveConnect = r; }); }
  async disconnect() { this.disconnects++; }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('ConnectorSource', () => {
  it('drops a connection that finishes connecting after stop()', async () => {
    const conns: FakeConn[] = [];
    const statuses: SourceStatus[] = [];
    const src = new ConnectorSource({ username: 'x' }, () => { const c = new FakeConn(); conns.push(c); return c; });
    const started = src.start(() => {}, (s) => statuses.push(s));
    await tick();
    await src.stop();
    conns[0].resolveConnect({ roomId: 'R1' });
    await started;
    expect(conns[0].disconnects).toBeGreaterThanOrEqual(1);
    expect(statuses.some((s) => s.state === 'connected')).toBe(false);
  });
  it('reports connected with roomId on success', async () => {
    const statuses: SourceStatus[] = [];
    let conn!: FakeConn;
    const src = new ConnectorSource({ username: 'x' }, () => (conn = new FakeConn()));
    const started = src.start(() => {}, (s) => statuses.push(s));
    await tick();
    conn.resolveConnect({ roomId: 'R1' });
    await started;
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', roomId: 'R1' });
    await src.stop();
  });
  it('emits normalized events from the connection', async () => {
    const got: string[] = [];
    let conn!: FakeConn;
    const src = new ConnectorSource({ username: 'x' }, () => (conn = new FakeConn()));
    const started = src.start((e) => got.push(e.type), () => {});
    await tick();
    conn.resolveConnect({ roomId: 'R1' });
    await started;
    conn.emit('like', { user: { id: '1', displayId: 'a', nickname: 'A' }, count: 3 });
    expect(got).toEqual(['like']);
    await src.stop();
  });
});
