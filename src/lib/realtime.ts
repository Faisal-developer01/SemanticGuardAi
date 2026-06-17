/**
 * SemanticGuard AI — real-time monitoring channel (Socket.IO client).
 *
 * Recruiters/admins open one authenticated socket and join the `monitor` room.
 * The backend fans out `session_update` (live snapshots) and `alert` events as
 * candidates push integrity events / status heartbeats over REST.
 */
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { getAccessToken, type ApiAlert, type ApiLiveSession, type ApiNotification } from '@/lib/api';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: (cb: (data: { token: string }) => void) => cb({ token: getAccessToken() ?? '' }),
    });
  }
  return socket;
}

export interface MonitoringFeed {
  /** Live sessions keyed by sessionId, hydrated from REST then kept fresh by sockets. */
  sessions: ApiLiveSession[];
  /** Most-recent alerts first (capped). */
  alerts: ApiAlert[];
  connected: boolean;
}

/**
 * Subscribe to the live monitoring feed. Pass the initial REST snapshot so the
 * grid renders immediately; socket updates then merge in.
 */
export function useMonitoringFeed(
  initial: ApiLiveSession[],
  options?: { assessmentId?: string; onAlert?: (alert: ApiAlert) => void },
): MonitoringFeed {
  const [sessions, setSessions] = useState<ApiLiveSession[]>(initial);
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [connected, setConnected] = useState(false);

  // Keep latest initial snapshot without re-subscribing the socket.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const onAlertRef = useRef(options?.onAlert);
  onAlertRef.current = options?.onAlert;
  const assessmentId = options?.assessmentId;

  // Re-hydrate when a fresh REST snapshot arrives.
  useEffect(() => {
    setSessions(initial);
  }, [initial]);

  useEffect(() => {
    const s = getSocket();

    const handleConnect = () => {
      setConnected(true);
      s.emit('join_monitoring', assessmentId ? { assessmentId } : {});
    };
    const handleDisconnect = () => setConnected(false);
    const handleUpdate = (payload: ApiLiveSession) => {
      setSessions((prev) => {
        const idx = prev.findIndex((x) => x.sessionId === payload.sessionId);
        if (idx === -1) return [payload, ...prev];
        const next = prev.slice();
        next[idx] = { ...next[idx], ...payload };
        return next;
      });
    };
    const handleAlert = (payload: ApiAlert) => {
      setAlerts((prev) => [payload, ...prev].slice(0, 50));
      onAlertRef.current?.(payload);
    };

    s.on('connect', handleConnect);
    s.on('disconnect', handleDisconnect);
    s.on('session_update', handleUpdate);
    s.on('alert', handleAlert);

    if (s.connected) handleConnect();
    else s.connect();

    return () => {
      s.emit('leave_monitoring', assessmentId ? { assessmentId } : {});
      s.off('connect', handleConnect);
      s.off('disconnect', handleDisconnect);
      s.off('session_update', handleUpdate);
      s.off('alert', handleAlert);
    };
  }, [assessmentId]);

  return { sessions, alerts, connected };
}

/** Tear down the shared socket (e.g. on logout). */
export function disconnectMonitoring(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Subscribe to the current user's personal notification stream. Works for every
 * authenticated role (the server auto-joins the `user:{id}` room on connect).
 * Pass `enabled = isAuthenticated` so the socket only opens when logged in.
 */
export function useUserNotifications(
  handler: (notification: ApiNotification) => void,
  enabled = true,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    const s = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onNotification = (n: ApiNotification) => handlerRef.current(n);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('notification', onNotification);

    if (s.connected) setConnected(true);
    else s.connect();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('notification', onNotification);
    };
  }, [enabled]);

  return { connected };
}
