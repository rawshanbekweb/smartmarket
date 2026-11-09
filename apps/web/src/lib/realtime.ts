import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

/** Subscribe to backend events and refresh affected queries. */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    // Connect on the next tick: in React StrictMode (dev) the effect mounts, unmounts and
    // re-mounts immediately — connecting synchronously aborts a half-open WebSocket.
    const socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'], autoConnect: false });
    const connectTimer = setTimeout(() => socket.connect(), 0);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Set<string>();
    // Debounce bursts (e.g. many observations) into one refresh.
    const invalidate = (...keys: string[]) => {
      keys.forEach((k) => pending.add(k));
      if (timer) return;
      timer = setTimeout(() => {
        pending.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        pending.clear();
        timer = null;
      }, 600);
    };
    socket.on('space:updated', () => invalidate('dashboard', 'spaces', 'space', 'rows', 'cashier'));
    socket.on('payment:created', () => invalidate('dashboard', 'payments', 'cashier', 'spaces', 'space'));
    socket.on('payment:updated', () => invalidate('dashboard', 'payments', 'payment', 'spaces', 'space'));
    socket.on('alert:created', () => invalidate('dashboard', 'alerts', 'alert', 'notifications'));
    socket.on('alert:updated', () => invalidate('dashboard', 'alerts', 'alert', 'complaints'));
    socket.on('camera:updated', () => invalidate('dashboard', 'cameras', 'camera', 'spaces'));
    socket.on('notification:new', () => invalidate('notifications'));
    return () => {
      clearTimeout(connectTimer);
      if (timer) clearTimeout(timer);
      socket.disconnect();
    };
  }, [enabled, qc]);
}
