'use client';
import dynamic from 'next/dynamic';

// Phaser touches `window` on import, so it must never render on the server.
const PhaserGame = dynamic(() => import('@/game/PhaserGame'), { ssr: false });

export default function GamePage() {
  return (
    <main style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <PhaserGame />
    </main>
  );
}
