'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, GameEvent, GameSnapshot, ServerMsg, SourceStatus } from '@/shared/types';

type Listener = (e: GameEvent[]) => void;

/** Live connection to the game server. Reconnects every second if the server restarts. */
export function useGameSocket() {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [status, setStatus] = useState<SourceStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const token = new URLSearchParams(location.search).get('token');
      const ws = new WebSocket(`${proto}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        let m: ServerMsg;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'snapshot') setSnapshot(m.s);
        else if (m.t === 'status') setStatus(m.s);
        else if (m.t === 'events') listeners.current.forEach((l) => l(m.e));
      };
      ws.onclose = () => {
        setConnected(false);
        if (alive) retry = setTimeout(open, 1000);
      };
    };
    open();
    return () => {
      alive = false;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((m: ClientMsg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  const onEvents = useCallback((cb: Listener) => {
    listeners.current.add(cb);
    return () => { listeners.current.delete(cb); };
  }, []);

  return { snapshot, status, connected, send, onEvents };
}
