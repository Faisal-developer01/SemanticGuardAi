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
    const env = import.meta.env as Record<string, string | undefined>;
    const apiBaseUrl = env.VITE_API_BASE_URL;
    const configuredUrl = env.VITE_SOCKET_URL ?? (
      apiBaseUrl?.startsWith('http') ? new URL(apiBaseUrl).origin : window.location.origin
    );
    const configuredHostname = new URL(configuredUrl, window.location.origin).hostname;
    const isLoopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(configuredHostname);
    const socketUrl = import.meta.env.PROD && isLoopback ? window.location.origin : configuredUrl;
    socket = io(socketUrl, {
      path: '/socket.io',
      autoConnect: false,
      // Polling only: the backend runs Socket.IO in threading mode (gunicorn
      // gthread) which cannot serve WebSocket. Attempting a WS upgrade gets a
      // 101 at the App Service edge then drops, breaking the connection — so we
      // stay on long-polling, which is reliable for signaling + live updates.
      transports: ['polling'],
      upgrade: false,
      auth: (cb: (data: { token: string }) => void) => cb({ token: getAccessToken() ?? '' }),
    });
    socket.on('connect', () => {
      console.info('[Socket] connected', { connected: socket?.connected ?? false, id: socket?.id });
    });
    socket.on('connect_error', (error) => {
      console.error('[Socket] connection error', error.message);
    });
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] disconnected', { reason, connected: socket?.connected ?? false, id: socket?.id });
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected && !s.active) {
    console.info('[Socket] connecting', { connected: s.connected });
    s.connect();
  }
  return s;
}


export interface MonitoringFeed {
  /** Live sessions keyed by sessionId, hydrated from REST then kept fresh by sockets. */
  sessions: ApiLiveSession[];
  /** Most-recent alerts first (capped). */
  alerts: ApiAlert[];
  connected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
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
  const [connectionState, setConnectionState] = useState<MonitoringFeed['connectionState']>('connecting');

  const onAlertRef = useRef(options?.onAlert);
  onAlertRef.current = options?.onAlert;
  const assessmentId = options?.assessmentId;

  // Re-hydrate when a fresh REST snapshot arrives.
  useEffect(() => {
    setSessions((current) => {
      const next = current.slice();
      for (const session of initial) {
        const index = next.findIndex((item) => item.sessionId === session.sessionId);
        if (index === -1) next.push(session);
        else next[index] = { ...next[index], ...session };
      }
      return next;
    });
  }, [initial]);

  useEffect(() => {
    const s = connectSocket();

    const handleConnect = () => {
      setConnected(true);
      setConnectionState('connected');
      s.emit('join_monitoring', assessmentId ? { assessmentId } : {});
    };
    const handleDisconnect = () => {
      setConnected(false);
      setConnectionState('disconnected');
    };
    const handleConnectError = () => setConnectionState('error');
    const mergeSession = (payload: ApiLiveSession) => {
      setSessions((prev) => {
        const idx = prev.findIndex((x) => x.sessionId === payload.sessionId);
        if (idx === -1) return [payload, ...prev];
        const next = prev.slice();
        next[idx] = { ...next[idx], ...payload };
        return next;
      });
    };
    const handleUpdate = (payload: ApiLiveSession) => mergeSession(payload);
    const handleCandidateStarted = (payload: ApiLiveSession) => {
      console.info('[Socket] candidate_started received', {
        candidateId: payload.candidateId,
        sessionId: payload.sessionId,
        assessmentId: payload.assessmentId,
        status: payload.status,
      });
      mergeSession(payload);
    };
    const handleAlert = (payload: ApiAlert) => {
      setAlerts((prev) => [payload, ...prev].slice(0, 50));
      onAlertRef.current?.(payload);
    };

    s.on('connect', handleConnect);
    s.on('disconnect', handleDisconnect);
    s.on('connect_error', handleConnectError);
    s.on('session_update', handleUpdate);
    s.on('candidate_started', handleCandidateStarted);
    s.on('alert', handleAlert);

    if (s.connected) handleConnect();
    else setConnectionState('connecting');

    return () => {
      s.emit('leave_monitoring', assessmentId ? { assessmentId } : {});
      s.off('connect', handleConnect);
      s.off('disconnect', handleDisconnect);
      s.off('connect_error', handleConnectError);
      s.off('session_update', handleUpdate);
      s.off('candidate_started', handleCandidateStarted);
      s.off('alert', handleAlert);
    };
  }, [assessmentId]);

  return { sessions, alerts, connected, connectionState };
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
  stream: MediaStream | null;
}): void {
  const { enabled, sessionId, stream } = opts;

  useEffect(() => {
    if (!enabled || !sessionId || !stream?.getVideoTracks().some(track => track.readyState === 'live')) return;
    const s = connectSocket();

    // One peer connection per viewer, keyed by the viewer's user id.
    const peers = new Map<string, RTCPeerConnection>();
    // ICE candidates that arrive before the remote description is set.
    const pending = new Map<string, RTCIceCandidateInit[]>();
    const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
    let disposed = false;

    const closePeer = (viewerId: string) => {
      clearTimeout(timeouts.get(viewerId));
      timeouts.delete(viewerId);
      const pc = peers.get(viewerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
        peers.delete(viewerId);
      }
      pending.delete(viewerId);
    };

    const handleRequest = async (data: { viewerId?: string; sessionId?: string | null }) => {
      const viewerId = data?.viewerId;
      if (disposed || !viewerId || (data.sessionId && data.sessionId !== sessionId)) return;
      const existing = peers.get(viewerId);
      if (existing && !['failed', 'closed', 'disconnected'].includes(existing.connectionState)) return;
      closePeer(viewerId); // reset any stale connection for this viewer

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peers.set(viewerId, pc);
      for (const track of stream.getTracks()) {
        if (track.readyState === 'live') pc.addTrack(track, stream);
      }
      timeouts.set(viewerId, setTimeout(() => {
        if (peers.get(viewerId) === pc && pc.connectionState !== 'connected') {
          console.error('[WebRTC] publisher connection timed out', { viewerId, sessionId });
          closePeer(viewerId);
        }
      }, 15000));

      pc.onicecandidate = (ev) => {
        if (ev.candidate && peers.get(viewerId) === pc) {
          console.info('[WebRTC] ICE candidate sent', { viewerId });
          s.emit('webrtc_ice', { targetId: viewerId, candidate: ev.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        console.info('[WebRTC] publisher connection state', { viewerId, state: pc.connectionState });
        if (pc.connectionState === 'connected') {
          clearTimeout(timeouts.get(viewerId));
          timeouts.delete(viewerId);
        }
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(viewerId);
      };

      try {
        const offer = await pc.createOffer();
        if (disposed || peers.get(viewerId) !== pc) return;
        await pc.setLocalDescription(offer);
        if (disposed || peers.get(viewerId) !== pc) return;
        s.emit('webrtc_offer', { viewerId, sessionId, sdp: pc.localDescription });
      } catch (error) {
        console.error('[WebRTC] could not publish camera offer', { viewerId, sessionId, error });
        if (peers.get(viewerId) === pc) closePeer(viewerId);
      }
    };

    const handleAnswer = async (data: { viewerId?: string; sdp?: RTCSessionDescriptionInit }) => {
      const viewerId = data?.viewerId;
      const pc = viewerId ? peers.get(viewerId) : undefined;
      if (!viewerId || !pc || !data?.sdp) return;
      console.info('[WebRTC] answer received', { viewerId });
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const queued = pending.get(viewerId) ?? [];
        pending.delete(viewerId);
        for (const c of queued) await pc.addIceCandidate(c);
      } catch (error) {
        console.error('[WebRTC] could not apply viewer answer/ICE', { viewerId, error });
        if (peers.get(viewerId) === pc) closePeer(viewerId);
      }
    };

    const handleIce = async (data: { fromId?: string; candidate?: RTCIceCandidateInit }) => {
      const fromId = data?.fromId;
      const pc = fromId ? peers.get(fromId) : undefined;
      if (!fromId || !data?.candidate) return;
      console.info('[WebRTC] ICE candidate received', { viewerId: fromId });
      if (!pc) return;
      if (!pc.remoteDescription) {
        const arr = pending.get(fromId) ?? [];
        arr.push(data.candidate);
        pending.set(fromId, arr);
        return;
      }
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('[WebRTC] could not apply viewer ICE', { viewerId: fromId, error });
      }
    };

    const handleStop = (data: { fromId?: string }) => {
      if (data?.fromId) closePeer(data.fromId);
    };
    const handleDisconnect = () => {
      for (const viewerId of Array.from(peers.keys())) closePeer(viewerId);
    };

    s.on('webrtc_request', handleRequest);
    s.on('webrtc_answer', handleAnswer);
    s.on('webrtc_ice', handleIce);
    s.on('webrtc_stop', handleStop);
    s.on('disconnect', handleDisconnect);

    return () => {
      disposed = true;
      s.off('webrtc_request', handleRequest);
      s.off('webrtc_answer', handleAnswer);
      s.off('webrtc_ice', handleIce);
      s.off('webrtc_stop', handleStop);
      s.off('disconnect', handleDisconnect);
      for (const viewerId of Array.from(peers.keys())) {
        s.emit('webrtc_stop', { targetId: viewerId });
        closePeer(viewerId);
      }
    };
  }, [enabled, sessionId, stream]);
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
}): WebRTCFeed {
  const { candidateId, sessionId, enabled } = opts;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<RTCPeerConnectionState | 'idle'>('idle');
  useEffect(() => {
    if (!enabled || !candidateId) return;
    const s = connectSocket();

    let pc: RTCPeerConnection | null = null;
    let disposed = false;
    const pending: RTCIceCandidateInit[] = [];
    let connectionTimeout: ReturnType<typeof setTimeout> | undefined;

    const teardown = () => {
      clearTimeout(connectionTimeout);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
        pc = null;
      }
      pending.length = 0;
    };

    const requestFeed = () => {
      if (disposed || !s.connected || pc) return;
      s.emit('webrtc_request', { candidateId, sessionId });
    };

    const handleOffer = async (data: { candidateId?: string; sessionId?: string; sdp?: RTCSessionDescriptionInit }) => {
      if (disposed || data?.candidateId !== candidateId || !data?.sdp
        || (sessionId && data.sessionId !== sessionId)) return;
      console.info('[WebRTC] offer received', { candidateId });
      const queued = pending.splice(0);
      teardown();
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc = peer;
      const remoteStream = new MediaStream();
      setStream(null);
      setState('connecting');
      connectionTimeout = setTimeout(() => {
        if (pc === peer && peer.connectionState !== 'connected') {
          console.error('[WebRTC] viewer connection timed out', { candidateId, sessionId });
          teardown();
          setStream(null);
          setState('failed');
        }
      }, 15000);

      peer.ontrack = (ev) => {
        if (disposed || pc !== peer) return;
        const received = ev.streams[0] ?? remoteStream;
        if (!received.getTracks().includes(ev.track)) received.addTrack(ev.track);
        console.info('[WebRTC] stream received', { candidateId, kind: ev.track.kind });
        setStream(received);
      };
      peer.onicecandidate = (ev) => {
        if (ev.candidate && pc === peer) {
          console.info('[WebRTC] ICE candidate sent', { candidateId });
          s.emit('webrtc_ice', { targetId: candidateId, candidate: ev.candidate.toJSON() });
        }
      };
      peer.onconnectionstatechange = () => {
        if (disposed || pc !== peer) return;
        console.info('[WebRTC] viewer connection state', { candidateId, state: peer.connectionState });
        setState(peer.connectionState);
        if (peer.connectionState === 'connected') clearTimeout(connectionTimeout);
        if (['failed', 'disconnected'].includes(peer.connectionState)) {
          teardown();
          setStream(null);
        }
      };

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (disposed || pc !== peer) return;
        for (const candidate of [...queued, ...pending.splice(0)]) await peer.addIceCandidate(candidate);
        const answer = await peer.createAnswer();
        if (disposed || pc !== peer) return;
        await peer.setLocalDescription(answer);
        if (disposed || pc !== peer) return;
        s.emit('webrtc_answer', { candidateId, sdp: peer.localDescription });
      } catch (error) {
        console.error('[WebRTC] could not answer camera offer', { candidateId, sessionId, error });
        if (pc === peer) {
          teardown();
          setStream(null);
          setState('failed');
        }
      }
    };

    const handleIce = async (data: { fromId?: string; candidate?: RTCIceCandidateInit }) => {
      if (data?.fromId !== candidateId || !data?.candidate) return;
      console.info('[WebRTC] ICE candidate received', { candidateId });
      if (!pc || !pc.remoteDescription) {
        pending.push(data.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('[WebRTC] could not apply candidate ICE', { candidateId, error });
      }
    };
    const handleDisconnect = () => {
      teardown();
      setStream(null);
      setState('disconnected');
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
    s.on('connect', requestFeed);
    s.on('disconnect', handleDisconnect);

    requestFeed();
    // Keep asking until the candidate answers (they may still be initializing).
    const retry = setInterval(() => {
      requestFeed();
    }, 1000);

    return () => {
      disposed = true;
      clearInterval(retry);
      s.off('webrtc_offer', handleOffer);
      s.off('webrtc_ice', handleIce);
      s.off('webrtc_stop', handleStop);
      s.off('connect', requestFeed);
      s.off('disconnect', handleDisconnect);
      s.emit('webrtc_stop', { targetId: candidateId });
      teardown();
    };
  }, [enabled, candidateId, sessionId]);

  return enabled && candidateId ? { stream, state } : { stream: null, state: 'idle' };
}

export interface WebRTCFeed {
  stream: MediaStream | null;
  state: RTCPeerConnectionState | 'idle';
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
    const s = connectSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onNotification = (n: ApiNotification) => handlerRef.current(n);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('notification', onNotification);

    if (s.connected) setConnected(true);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('notification', onNotification);
    };
  }, [enabled]);

  return { connected };
}
