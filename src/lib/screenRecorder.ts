// Screen recording for proctoring evidence.
//
// Captures the candidate's screen via getDisplayMedia and records it in short,
// independently-playable segments (each a standalone WebM) that are uploaded as
// evidence. Segmenting means a dropped connection or closed browser only loses
// the final in-flight clip, and recruiters can replay the session as a timeline.

import { useCallback, useRef, useState } from 'react';
import { evidenceApi } from '@/lib/api';

interface UseScreenRecorderOptions {
  sessionId: string | null;
  /** Segment length in ms (each becomes one uploaded clip). Default 30s. */
  segmentMs?: number;
  /** Called when the user stops screen sharing from the browser UI. */
  onEnded?: () => void;
}

interface ScreenRecorderControls {
  active: boolean;
  error: string | null;
  start: () => Promise<boolean>;
  stop: () => void;
}

const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

function pickMimeType(): string {
  for (const m of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'video/webm';
}

export function useScreenRecorder(opts: UseScreenRecorderOptions): ScreenRecorderControls {
  const { sessionId, segmentMs = 30_000, onEnded } = opts;
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  const mimeRef = useRef<string>('video/webm');
  // Mirror the session id so uploads always use the latest value even if
  // recording starts in the same tick the session id is being set.
  const sessionIdRef = useRef<string | null>(sessionId);
  sessionIdRef.current = sessionId;

  const uploadSegment = useCallback((blob: Blob) => {
    const sid = sessionIdRef.current;
    if (!sid || blob.size < 1024) return; // skip empty/near-empty clips
    evidenceApi.upload(sid, blob, 'video', new Date().toISOString()).catch(() => {
      /* best-effort — a failed clip must not interrupt the exam */
    });
  }, []);

  // Records one segment; on stop it uploads and (unless stopping) starts the next.
  const recordSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mimeRef.current });
    } catch {
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      chunksRef.current = [];
      uploadSegment(blob);
      if (!stoppingRef.current && streamRef.current) recordSegment();
    };

    recorder.start();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop(); // triggers onstop -> upload -> next segment
      }
    }, segmentMs);
  }, [segmentMs, uploadSegment]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop(); // flushes and uploads the final clip
      } catch {
        /* ignore */
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    stoppingRef.current = false;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('Screen recording is not supported by this browser.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 8 },
        audio: false,
      });
      streamRef.current = stream;
      mimeRef.current = pickMimeType();
      // The user can end sharing via the browser's own control.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (!stoppingRef.current) {
          stop();
          onEnded?.();
        }
      });
      recordSegment();
      setActive(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Screen sharing was denied.');
      return false;
    }
  }, [recordSegment, stop, onEnded]);

  return { active, error, start, stop };
}
