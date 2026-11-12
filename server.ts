import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { GAME } from './src/config/game';
import { GameEngine } from './src/engine/GameEngine';
import { wsAccess } from './src/server/access';
import { Hub } from './src/server/hub';
import { ConnectorSource, TikFinitySource } from './src/sources/EventSource';
import { SqliteStore } from './src/store/Store';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
// Local only by default; set HOST=0.0.0.0 to expose on the LAN (control still needs the token).
const host = process.env.HOST || '127.0.0.1';
const token = process.env.CONTROL_TOKEN || randomBytes(12).toString('hex');
const app = next({ dev, hostname: host, port });

app.prepare().then(() => {
  const handle = app.getRequestHandler();
  const upgradeNext = app.getUpgradeHandler();

  const store = new SqliteStore(process.env.DB_FILE || 'data/game.db');
  const engine = new GameEngine({ store, rng: Math.random, now: Date.now });
  engine.startSession(store.loadSession()?.roomId ?? null);

  const hub = new Hub({
    engine,
    makeSource: (m) =>
      m.kind === 'connector'
        ? new ConnectorSource({ username: m.username, signApiKey: m.signApiKey || process.env.EULER_API_KEY })
        : new TikFinitySource({ url: m.url }),
  });

  const server = createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url || '/', 'http://localhost').pathname === '/ws') {
      const access = wsAccess({ url: req.url || '/', origin: req.headers.origin, host: req.headers.host }, token);
      if (!access.ok) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => hub.attach(ws, access.canControl));
    } else {
      upgradeNext(req, socket, head); // Next HMR
    }
  });

  const tick = setInterval(() => hub.tick(), GAME.TICK_MS);
  const save = setInterval(() => engine.persist(), GAME.SAVE_INTERVAL_MS);

  const shutdown = async () => {
    clearInterval(tick);
    clearInterval(save);
    engine.persist();
    await hub.stopAll();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(port, host, () => {
    console.log(`> Dig Party ready`);
    console.log(`  แผงควบคุม: http://localhost:${port}/control?token=${token}`);
    console.log(`  OBS:       http://localhost:${port}/game`);
  });
});
