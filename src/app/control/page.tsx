'use client';
import { useEffect, useState } from 'react';
import { useGameSocket } from '@/game/useGameSocket';
import { BIOME_NAMES_TH } from '@/config/game';
import type { LiveEvent, SourceKind } from '@/shared/types';

const STORE_KEY = 'digparty.control';
type Saved = { kind: SourceKind; username: string; apiKey: string; tfUrl: string };
const DEFAULTS: Saved = { kind: 'connector', username: '', apiKey: '', tfUrl: 'ws://localhost:21213/' };

function load(): Saved {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch { return DEFAULTS; }
}
function save(s: Saved) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const STATE_TH: Record<string, [string, string]> = {
  idle: ['ยังไม่เชื่อมต่อ', 'bg-zinc-600'],
  connecting: ['กำลังเชื่อมต่อ…', 'bg-amber-600'],
  connected: ['เชื่อมต่อแล้ว', 'bg-emerald-600'],
  reconnecting: ['กำลังเชื่อมต่อใหม่…', 'bg-amber-600'],
  error: ['ผิดพลาด', 'bg-red-600'],
};

const GIFTS = [
  { label: 'Rose (1💎)', name: 'Rose', diamonds: 1 },
  { label: 'Galaxy (1000💎)', name: 'Galaxy', diamonds: 1000 },
  { label: 'Whale (30000💎)', name: 'Whale', diamonds: 30000 },
];

export default function ControlPage() {
  const { snapshot, status, connected, send } = useGameSocket();
  const [cfg, setCfg] = useState<Saved>(DEFAULTS);
  const [tester, setTester] = useState('tester1');

  useEffect(() => {
    setCfg(load()); // eslint-disable-line react-hooks/set-state-in-effect
    setTester(`tester${Math.floor(Math.random() * 90 + 10)}`);
  }, []);
  const update = (p: Partial<Saved>) => setCfg((c) => { const n = { ...c, ...p }; save(n); return n; });

  const connect = () =>
    cfg.kind === 'connector'
      ? send({ t: 'connect', kind: 'connector', username: cfg.username.trim(), signApiKey: cfg.apiKey.trim() || undefined })
      : send({ t: 'connect', kind: 'tikfinity', url: cfg.tfUrl.trim() });

  const user = { userId: `mock:${tester}`, uniqueId: tester, nickname: tester };
  const mock = (event: LiveEvent) => send({ t: 'mock', event });
  const [stateLabel, stateColor] = STATE_TH[status?.state ?? 'idle'];

  const btn = 'rounded-lg px-3 py-2 font-medium disabled:opacity-40';
  const input = 'w-full rounded-lg bg-zinc-800 px-3 py-2 outline-none focus:ring-2 ring-amber-500';

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">⛏ Dig Party — แผงควบคุม</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className={`rounded-full px-3 py-1 ${connected ? 'bg-emerald-700' : 'bg-red-700'}`}>
              {connected ? 'server ออนไลน์' : 'server ออฟไลน์'}
            </span>
            <a className="underline text-amber-400" href="/game" target="_blank">เปิดหน้าเกม ↗</a>
          </div>
        </header>

        <section className="rounded-xl bg-zinc-900 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">แหล่งข้อมูลไลฟ์</h2>
            <span className={`rounded-full px-3 py-1 text-sm ${stateColor}`}>
              {stateLabel}{status?.roomId ? ` · room ${status.roomId}` : ''}
            </span>
          </div>
          {status?.error && <p className="text-sm text-red-400">{status.error}</p>}
          <div className="flex gap-4">
            {(['connector', 'tikfinity'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" checked={cfg.kind === k} onChange={() => update({ kind: k })} />
                {k === 'connector' ? 'TikTok Connector (Euler)' : 'TikFinity'}
              </label>
            ))}
          </div>
          {cfg.kind === 'connector' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={input} placeholder="username ไลฟ์ เช่น @mychannel" value={cfg.username}
                onChange={(e) => update({ username: e.target.value })} />
              <input className={input} placeholder="Euler API key (ไม่บังคับ)" type="password" value={cfg.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })} />
            </div>
          ) : (
            <input className={input} value={cfg.tfUrl} onChange={(e) => update({ tfUrl: e.target.value })} />
          )}
          <div className="flex flex-wrap gap-2">
            <button className={`${btn} bg-amber-600`} onClick={connect}
              disabled={cfg.kind === 'connector' && !cfg.username.trim()}>เชื่อมต่อ</button>
            <button className={`${btn} bg-zinc-700`} onClick={() => send({ t: 'disconnect' })}>ตัดการเชื่อมต่อ</button>
            <button className={`${btn} bg-red-800 ml-auto`}
              onClick={() => confirm('เริ่มไลฟ์ใหม่? ความลึกจะกลับไปที่ผิวดิน (ของสะสมของคนดูไม่หาย)') && send({ t: 'newLive' })}>
              เริ่มไลฟ์ใหม่
            </button>
          </div>
        </section>

        {snapshot && (
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              ['ความลึก', `${snapshot.depthM} m`],
              ['ชั้น', `${snapshot.layer} · ${BIOME_NAMES_TH[snapshot.biome]}`],
              ['ขุดทั้งหมด', snapshot.totalDigs.toLocaleString()],
              ['กำลังขุด', `${snapshot.activeCount} คน`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-zinc-900 p-3">
                <div className="text-xs text-zinc-400">{k}</div>
                <div className="text-lg font-bold">{v}</div>
              </div>
            ))}
          </section>
        )}

        <section className="rounded-xl bg-zinc-900 p-4 space-y-3">
          <h2 className="font-semibold">ทดสอบ (จำลองคนดู)</h2>
          <input className={input} value={tester} onChange={(e) => setTester(e.target.value.replace(/\s/g, ''))} />
          <div className="flex flex-wrap gap-2">
            <button className={`${btn} bg-pink-700`} onClick={() => mock({ type: 'like', user, count: 1 })}>❤ ×1</button>
            <button className={`${btn} bg-pink-700`} onClick={() => mock({ type: 'like', user, count: 15 })}>❤ ×15</button>
            {GIFTS.map((g) => (
              <button key={g.name} className={`${btn} bg-violet-700`}
                onClick={() => mock({ type: 'gift', user, giftName: g.name, diamonds: g.diamonds, repeat: 1 })}>
                🎁 {g.label}
              </button>
            ))}
            <button className={`${btn} bg-sky-700`} onClick={() => mock({ type: 'join', user })}>👋 เข้าไลฟ์</button>
            <button className={`${btn} bg-sky-700`} onClick={() => mock({ type: 'chat', user, text: '!bag' })}>💬 !bag</button>
          </div>
        </section>
      </div>
    </main>
  );
}
