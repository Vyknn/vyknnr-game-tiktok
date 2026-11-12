import { createServer } from 'node:http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { GAME } from './src/config/game';
import { GameEngine } from './src/engine/GameEngine';
import { Hub } from './src/server/hub';
import { ConnectorSource, TikFinitySource } from './src/sources/EventSource';
import { SqliteStore } from './src/store/Store';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });

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
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws) => hub.attach(ws));
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url || '/', 'http://localhost').pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
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

  server.listen(port, () => {
    console.log(`> Dig Party ready: http://localhost:${port}/control  |  OBS: http://localhost:${port}/game`);
  });
});
