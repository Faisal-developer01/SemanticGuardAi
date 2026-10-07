// Session recording for proctoring evidence.
//
// Records the supplied media stream (or an explicitly requested screen share) in short,
// independently-playable segments (each a standalone WebM) that are uploaded as
// evidence. Segmenting means a dropped connection or closed browser only loses
// the final in-flight clip, and recruiters can replay the session as a timeline.

import { useCallback, useEffect, useRef, useState } from 'react';
import { evidenceApi } from '@/lib/api';

interface UseScreenRecorderOptions {
  sessionId: string | null;
  /** Segment length in ms (each becomes one uploaded clip). Default 30s. */
  segmentMs?: number;
  videoBitsPerSecond?: number;
  /** Called when the recording's media source ends unexpectedly. */
  onEnded?: () => void;
  onError?: (message: string) => void;
}

interface ScreenRecorderControls {
  active: boolean;
  error: string | null;
  start: (sessionId?: string, sourceStream?: MediaStream | null) => Promise<boolean>;
  stop: () => Promise<void>;
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

function pickMimeType(): string {
  for (const m of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  throw new Error('This browser cannot record session video in a supported format.');
}

export function useScreenRecorder(opts: UseScreenRecorderOptions): ScreenRecorderControls {
  const { sessionId, segmentMs = 30_000, videoBitsPerSecond = 500_000, onEnded, onError } = opts;
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  const mimeRef = useRef<string>('video/webm');
  const stoppedRef = useRef<Promise<void>>(Promise.resolve());
  const uploadsRef = useRef(new Set<Promise<void>>());
  const onErrorRef = useRef(onError);
  const onEndedRef = useRef(onEnded);
  const mountedRef = useRef(true);

  useEffect(() => {
    onErrorRef.current = onError;
    onEndedRef.current = onEnded;
  }, [onError, onEnded]);

  const reportError = useCallback((message: string, cause?: unknown) => {
    console.error('[Recording]', message, cause);
    if (mountedRef.current) setError(message);
    onErrorRef.current?.(message);
  }, []);

  const uploadSegment = useCallback((blob: Blob, sid: string, capturedAt: string) => {
    if (blob.size === 0) {
      reportError('The session recorder produced an empty clip; that segment could not be saved.');
      return;
    }
    const upload = evidenceApi.upload(sid, blob, 'video', capturedAt).then(() => undefined).catch((cause: unknown) => {
      reportError('A recording clip could not be saved. Please check your connection.', cause);
    }).finally(() => {
      uploadsRef.current.delete(upload);
    });
    uploadsRef.current.add(upload);
  }, [reportError]);

  const stop = useCallback(async () => {
    stoppingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const stopped = stoppedRef.current;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (mountedRef.current) setActive(false);
    await stopped;
    await Promise.all(uploadsRef.current);
  }, []);

  // Records one segment; on stop it uploads and (unless stopping) starts the next.
  const recordSegment = useCallback((stream: MediaStream, sid: string) => {
    const recorder = new MediaRecorder(stream, {
      mimeType: mimeRef.current,
      videoBitsPerSecond,
    });
    const chunks: BlobPart[] = [];
    const capturedAt = new Date().toISOString();
    let resolveStopped: () => void = () => {};
    stoppedRef.current = new Promise<void>(resolve => { resolveStopped = resolve; });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (recorderRef.current === recorder) recorderRef.current = null;
      uploadSegment(new Blob(chunks, { type: recorder.mimeType || mimeRef.current }), sid, capturedAt);
      resolveStopped();
      if (!stoppingRef.current && streamRef.current === stream) {
        try {
          recordSegment(stream, sid);
        } catch (cause) {
          reportError('Session recording stopped unexpectedly; further clips cannot be captured.', cause);
          void stop();
          onEndedRef.current?.();
        }
      }
    };
    recorder.onerror = event => {
      reportError('Session recording failed; please check screen sharing, camera access, and browser recording support.', event);
      void stop();
      onEndedRef.current?.();
    };

    try {
      recorder.start();
    } catch (cause) {
      recorderRef.current = null;
      resolveStopped();
      throw cause;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, segmentMs);
  }, [segmentMs, videoBitsPerSecond, uploadSegment, reportError, stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stop();
    };
  }, [stop]);

  const start = useCallback(async (sid = sessionId, sourceStream?: MediaStream | null): Promise<boolean> => {
    setError(null);
    if (!sid) {
      reportError('An assessment session is required before recording can start.');
      return false;
    }
    await stop();
    stoppingRef.current = false;
    if (sourceStream !== undefined && !sourceStream?.getVideoTracks().some(track => track.readyState === 'live')) {
      reportError('A live video source is required before session recording can start.');
      return false;
    }
    if (sourceStream === undefined && !navigator.mediaDevices?.getDisplayMedia) {
      reportError('Screen recording is not supported by this browser.');
      return false;
    }
    try {
      // Own the cloned tracks; stopping recording must not stop the live feed.
      const stream = sourceStream ? sourceStream.clone() : await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 8 },
        // Captures system/tab audio when the user grants permission.
        audio: true,
      });
      if (!mountedRef.current || stoppingRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      streamRef.current = stream;
      mimeRef.current = pickMimeType();
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (!stoppingRef.current && streamRef.current === stream) {
          void stop();
          onEndedRef.current?.();
        }
      });
      recordSegment(stream, sid);
      setActive(true);
      return true;
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'Session recording could not start.', err);
      await stop();
      return false;
    }
  }, [recordSegment, stop, sessionId, reportError]);

  return { active, error, start, stop };
}
