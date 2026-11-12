'use client';
import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { DigScene, H, W } from './DigScene';
import { useGameSocket } from './useGameSocket';

/** Mounts one Phaser game and pipes the server stream into DigScene. */
export default function PhaserGame() {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DigScene | null>(null);
  const { snapshot, onEvents } = useGameSocket();

  useEffect(() => {
    if (!host.current) return;
    const scene = new DigScene();
    sceneRef.current = scene;
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __dig: DigScene }).__dig = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: W,
      height: H,
      backgroundColor: '#170d07',
      pixelArt: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene,
    });
    return () => {
      sceneRef.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    if (snapshot) sceneRef.current?.applySnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => onEvents((e) => sceneRef.current?.applyEvents(e)), [onEvents]);

  return <div ref={host} style={{ width: '100vw', height: '100vh' }} />;
}
