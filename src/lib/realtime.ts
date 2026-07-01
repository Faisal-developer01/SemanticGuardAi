/**
 * SemanticGuard AI — real-time monitoring channel (Socket.IO client).
 *
 * Recruiters/admins open one authenticated socket and join the `monitor` room.
 * The backend fans out `session_update` (live snapshots) and `alert` events as
 * candidates push integrity events / status heartbeats over REST.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { io, type Socket } from 'socket.io-client';

import { getAccessToken, type ApiAlert, type ApiLiveSession, type ApiNotification } from '@/lib/api';

let socket: Socket | null = null;

/**
 * ICE servers for WebRTC. Public STUN covers most NAT scenarios; a TURN relay
 * (e.g. Azure Communication Services / coturn) can be appended via
 * VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL for restrictive
 * networks where a direct peer path cannot be established.
 */
export const ICE_SERVERS: RTCIceServer[] = (() => {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_TURN_URL) {
    servers.push({
      urls: env.VITE_TURN_URL,
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    });
  }
  return servers;
})();

export function getSocket(): Socket {
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
 * Stream the candidate's webcam to recruiters/admins as a live feed.
 *
 * Uses WebRTC for continuous, low-latency peer-to-peer video. The candidate is
 * the publisher: when a recruiter/admin viewer asks to watch (`webrtc_request`),
 * this hook opens a dedicated `RTCPeerConnection` for that viewer, attaches the
 * live media tracks, and completes the offer/answer/ICE handshake over the
 * authenticated socket. Multiple viewers can watch the same candidate at once
 * (one peer connection each). The media never touches the server.
 */
export function useCandidateWebRTC(opts: {
  enabled: boolean;
  sessionId: string | null;
  streamRef: RefObject<MediaStream | null>;
}): void {
  const { enabled, sessionId, streamRef } = opts;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const s = getSocket();
    if (!s.connected) s.connect();

    // One peer connection per viewer, keyed by the viewer's user id.
    const peers = new Map<string, RTCPeerConnection>();
    // ICE candidates that arrive before the remote description is set.
    const pending = new Map<string, RTCIceCandidateInit[]>();

    const closePeer = (viewerId: string) => {
      const pc = peers.get(viewerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        try { pc.close(); } catch { /* ignore */ }
        peers.delete(viewerId);
      }
      pending.delete(viewerId);
    };

    const handleRequest = async (data: { viewerId?: string; sessionId?: string | null }) => {
      const viewerId = data?.viewerId;
      const stream = streamRef.current;
      if (!viewerId || !stream) return;
      closePeer(viewerId); // reset any stale connection for this viewer

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peers.set(viewerId, pc);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          s.emit('webrtc_ice', { targetId: viewerId, candidate: ev.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(viewerId);
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        s.emit('webrtc_offer', { viewerId, sessionId: sessionIdRef.current, sdp: pc.localDescription });
      } catch {
        closePeer(viewerId);
      }
    };

    const handleAnswer = async (data: { viewerId?: string; sdp?: RTCSessionDescriptionInit }) => {
      const viewerId = data?.viewerId;
      const pc = viewerId ? peers.get(viewerId) : undefined;
      if (!pc || !data?.sdp) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const queued = pending.get(viewerId!) ?? [];
        for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
        pending.delete(viewerId!);
      } catch { /* ignore */ }
    };

    const handleIce = async (data: { fromId?: string; candidate?: RTCIceCandidateInit }) => {
      const fromId = data?.fromId;
      const pc = fromId ? peers.get(fromId) : undefined;
      if (!fromId || !data?.candidate) return;
      if (!pc || !pc.remoteDescription) {
        const arr = pending.get(fromId) ?? [];
        arr.push(data.candidate);
        pending.set(fromId, arr);
        return;
      }
      await pc.addIceCandidate(data.candidate).catch(() => {});
    };

    const handleStop = (data: { fromId?: string }) => {
      if (data?.fromId) closePeer(data.fromId);
    };

    s.on('webrtc_request', handleRequest);
    s.on('webrtc_answer', handleAnswer);
    s.on('webrtc_ice', handleIce);
    s.on('webrtc_stop', handleStop);

    return () => {
      s.off('webrtc_request', handleRequest);
      s.off('webrtc_answer', handleAnswer);
      s.off('webrtc_ice', handleIce);
      s.off('webrtc_stop', handleStop);
      for (const viewerId of Array.from(peers.keys())) {
        s.emit('webrtc_stop', { targetId: viewerId });
        closePeer(viewerId);
      }
    };
  }, [enabled, sessionId, streamRef]);
}

/**
 * Viewer side of the live feed: subscribe to one candidate's WebRTC stream.
 *
 * Sends a `webrtc_request` to the candidate, answers their offer, and returns
 * the live `MediaStream` for a `<video>` element plus the connection state.
 * Automatically retries the request until connected (handles the candidate
 * joining late) and recovers if the peer connection drops.
 */
export function useWebRTCViewer(opts: {
  candidateId: string | null;
  sessionId?: string | null;
  enabled: boolean;
}): { stream: MediaStream | null; state: RTCPeerConnectionState | 'idle' } {
  const { candidateId, sessionId, enabled } = opts;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<RTCPeerConnectionState | 'idle'>('idle');
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    if (!enabled || !candidateId) return;
    const s = getSocket();
    if (!s.connected) s.connect();

    let pc: RTCPeerConnection | null = null;
    let disposed = false;
    const pending: RTCIceCandidateInit[] = [];

    const teardown = () => {
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        try { pc.close(); } catch { /* ignore */ }
        pc = null;
      }
    };

    const requestFeed = () => {
      if (disposed) return;
      s.emit('webrtc_request', { candidateId, sessionId: sessionIdRef.current });
    };

    const handleOffer = async (data: { candidateId?: string; sdp?: RTCSessionDescriptionInit }) => {
      if (disposed || data?.candidateId !== candidateId || !data?.sdp) return;
      teardown();
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.ontrack = (ev) => {
        if (ev.streams[0]) setStream(ev.streams[0]);
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          s.emit('webrtc_ice', { targetId: candidateId, candidate: ev.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        if (!pc) return;
        setState(pc.connectionState);
        if (['failed', 'disconnected'].includes(pc.connectionState) && !disposed) {
          // Connection dropped — attempt recovery.
          teardown();
          setStream(null);
          setTimeout(requestFeed, 1500);
        }
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        while (pending.length) await pc.addIceCandidate(pending.shift()!).catch(() => {});
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        s.emit('webrtc_answer', { candidateId, sdp: pc.localDescription });
      } catch {
        teardown();
      }
    };

    const handleIce = async (data: { fromId?: string; candidate?: RTCIceCandidateInit }) => {
      if (data?.fromId !== candidateId || !data?.candidate) return;
      if (!pc || !pc.remoteDescription) {
        pending.push(data.candidate);
        return;
      }
      await pc.addIceCandidate(data.candidate).catch(() => {});
    };

    const handleStop = (data: { fromId?: string }) => {
      if (data?.fromId === candidateId) {
        teardown();
        setStream(null);
        setState('closed');
      }
    };

    s.on('webrtc_offer', handleOffer);
    s.on('webrtc_ice', handleIce);
    s.on('webrtc_stop', handleStop);

    requestFeed();
    // Keep asking until the candidate answers (they may still be initializing).
    const retry = setInterval(() => {
      if (!pc || ['failed', 'closed', 'disconnected', 'new'].includes(pc.connectionState)) requestFeed();
    }, 4000);

    return () => {
      disposed = true;
      clearInterval(retry);
      s.off('webrtc_offer', handleOffer);
      s.off('webrtc_ice', handleIce);
      s.off('webrtc_stop', handleStop);
      s.emit('webrtc_stop', { targetId: candidateId });
      teardown();
    };
  }, [enabled, candidateId, sessionId]);

  return { stream, state };
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
