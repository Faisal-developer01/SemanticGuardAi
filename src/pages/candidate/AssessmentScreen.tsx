import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { StatusDot, RiskBadge } from '@/components/shared/StatusBadges';
import { CodeEditor } from '@/components/shared/CodeEditor';
import { assessmentsApi, sessionsApi, type ApiSession } from '@/lib/api';
import { mapAssessment, mapQuestion } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  AlertTriangle, Camera, Eye, Monitor, Wifi, ChevronLeft, ChevronRight,
  Send, Clock, Shield, Volume2, Smartphone, Maximize, Mic
} from 'lucide-react';
import type { AIMonitoringStatus, Assessment, Question } from '@/types/types';

const AUDIO_THRESHOLD = 18; // RMS level to trigger audio alert

/* MediaPipe Face Landmarker — real gaze / head-pose detection */
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const GAZE_AWAY_MS = 700;   // sustained look-away before flagging
const GAZE_COOLDOWN = 3000; // min gap between gaze alerts
const FACE_COOLDOWN = 4000; // min gap between no-face / multi-face alerts
type GazeDir = 'center' | 'left' | 'right' | 'up' | 'down' | 'none';

const initStatus: AIMonitoringStatus = {
  faceDetected: true, faceVerified: true, facesCount: 1,
  eyeGaze: 'screen', headPose: 'normal',
  phoneDetected: false, audioDetected: false, suspiciousMovement: false,
  browserFocused: true, tabSwitches: 0, riskScore: 0, riskLevel: 'low',
};

const AssessmentScreen: React.FC = () => {
  const navigate = useNavigate();
  const { assessmentId: routeAssessmentId } = useParams<{ assessmentId: string }>();
  const [phase, setPhase] = useState<'preflight' | 'assessment' | 'submitted' | 'terminated'>('preflight');
  const [terminationReason, setTerminationReason] = useState('');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [aiStatus, setAiStatus] = useState<AIMonitoringStatus>(initStatus);
  const [alerts, setAlerts] = useState<{ msg: string; time: string }[]>([]);
  const [faceOk, setFaceOk] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [gazeDir, setGazeDir] = useState<GazeDir>('center');

  // Real assessment data + backend session state
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [availableList, setAvailableList] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [submittedSession, setSubmittedSession] = useState<ApiSession | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const aiStatusRef = useRef(aiStatus);
  aiStatusRef.current = aiStatus;

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const audioRafRef   = useRef<number | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const audioAlertRef = useRef<ReturnType<typeof setTimeout> | null>(null); // cooldown

  // Face / gaze detection refs
  const videoRef         = useRef<HTMLVideoElement | null>(null);
  const frameCanvasRef   = useRef<HTMLCanvasElement | null>(null);
  const faceLandmarkerRef = useRef<any>(null);
  const camStreamRef     = useRef<MediaStream | null>(null);
  const detectRafRef     = useRef<number | null>(null);
  const awayStartRef     = useRef<number | null>(null);
  const lastGazeAlertRef = useRef(0);
  const lastFaceAlertRef = useRef(0);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const pushAlert = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAlerts(a => [{ msg, time }, ...a].slice(0, 6));
    setAiStatus(s => {
      const next = Math.min(100, s.riskScore + 8);
      return { ...s, riskScore: next, riskLevel: next < 30 ? 'low' : next < 60 ? 'medium' : 'high' };
    });
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ─── Backend session pipeline ────────────────────────────────────────────────

  /** Push a real proctoring event to the backend; reconcile risk from the response. */
  const reportEvent = useCallback(
    (type: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'low', payload?: Record<string, unknown>) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      sessionsApi
        .ingestEvent(sid, { type, severity, occurredAt: new Date().toISOString(), payload })
        .then(({ session }) => {
          setAiStatus(s => ({
            ...s,
            riskScore: session.riskScore,
            riskLevel: (session.riskLevel ?? s.riskLevel) as AIMonitoringStatus['riskLevel'],
          }));
        })
        .catch(() => {});
    },
    [],
  );

  /** Update an answer locally and persist it to the backend (debounced). */
  const recordAnswer = useCallback((question: Question, value: string | number) => {
    setAnswers(a => ({ ...a, [question.id]: value }));
    const sid = sessionIdRef.current;
    if (!sid) return;
    const isChoice = question.type === 'multiple_choice' || question.type === 'true_false';
    const response = isChoice ? (question.options?.[value as number] ?? String(value)) : String(value);
    const language = question.type === 'coding' ? (question.languages?.[0] ?? question.language) : undefined;
    if (saveTimers.current[question.id]) clearTimeout(saveTimers.current[question.id]);
    saveTimers.current[question.id] = setTimeout(() => {
      sessionsApi.saveAnswer(sid, question.id, response, language).catch(() => {});
    }, 600);
  }, []);

  /** Start (or resume) the backend session, then enter the assessment phase. */
  const beginAssessment = useCallback(async () => {
    if (!assessment) return;
    setStarting(true);
    try {
      const session = await sessionsApi.start(assessment.id);
      sessionIdRef.current = session.id;
      setAiStatus(s => ({
        ...s,
        riskScore: session.riskScore,
        riskLevel: (session.riskLevel ?? 'low') as AIMonitoringStatus['riskLevel'],
      }));
      setPhase('assessment');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the assessment');
    } finally {
      setStarting(false);
    }
  }, [assessment]);

  // ─── Load the assessment + its questions (or list of available ones) ─────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        if (routeAssessmentId) {
          const [a, qs] = await Promise.all([
            assessmentsApi.get(routeAssessmentId),
            assessmentsApi.questions(routeAssessmentId),
          ]);
          if (cancelled) return;
          const mapped = mapAssessment(a);
          setAssessment(mapped);
          setQuestions(qs.map(mapQuestion).slice().sort((x, y) => x.order - y.order));
          setTimeLeft(mapped.duration * 60);
        } else {
          const page = await assessmentsApi.list({ status: 'active', perPage: 50 });
          if (cancelled) return;
          setAvailableList(page.items.map(item => mapAssessment(item)));
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load assessment');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeAssessmentId]);

  // ─── Fullscreen ────────────────────────────────────────────────────────────

  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch { /* user denied — handled by onchange listener */ }
  };

  useEffect(() => {
    const onFsChange = () => {
      const inFs = !!document.fullscreenElement;
      setIsFullscreen(inFs);
      if (!inFs && phase === 'assessment') {
        pushAlert('⚠ Fullscreen exited — screen monitoring paused');
        toast.error('⚠ You left fullscreen! Please return to fullscreen.', { duration: 5000 });
        reportEvent('browser_unfocused', 'medium', { context: 'fullscreen_exit' });
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [phase, pushAlert, reportEvent]);

  // ─── Tab switch & window blur — INSTANT termination ────────────────────────

  useEffect(() => {
    if (phase !== 'assessment') return;

    // Immediately end the assessment: stop all monitoring, leave fullscreen,
    // flag the candidate, and lock them out of the session.
    const terminate = (reason: string) => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAudioMonitoring();
      stopFaceMonitoring();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setAiStatus(s => ({
        ...s,
        tabSwitches: s.tabSwitches + 1,
        browserFocused: false,
        riskScore: 100,
        riskLevel: 'high',
      }));
      pushAlert(`⛔ Assessment terminated — ${reason}`);
      toast.error('Assessment terminated: you switched away from the assessment tab.', { duration: 6000 });
      setTerminationReason(reason);
      // Record the violation and finalize the session so it is graded + flagged.
      const sid = sessionIdRef.current;
      if (sid) {
        sessionsApi
          .ingestEvent(sid, {
            type: 'tab_switch',
            severity: 'critical',
            occurredAt: new Date().toISOString(),
            payload: { reason },
          })
          .catch(() => {});
        sessionsApi.submit(sid).then(setSubmittedSession).catch(() => {});
      }
      setPhase('terminated');
    };

    const onVisibility = () => {
      if (document.hidden) terminate('Tab / application switch detected');
    };

    // Switching to another window/app also fires blur before visibilitychange
    // in some browsers — treat it as the same violation.
    const onBlur = () => terminate('Window focus lost (switched away)');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
    // stopAudioMonitoring / stopFaceMonitoring are stable useCallbacks captured in the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pushAlert]);

  // ─── Microphone / audio detection ─────────────────────────────────────────

  const startAudioMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      setAudioActive(true);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      let lastAlertAt = 0;

      const poll = () => {
        analyser.getByteTimeDomainData(buf);
        // Compute RMS level
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length) * 100;

        if (rms > AUDIO_THRESHOLD) {
          const now = Date.now();
          if (now - lastAlertAt > 4000) { // 4s cooldown so it doesn't spam
            lastAlertAt = now;
            setAiStatus(s => ({ ...s, audioDetected: true }));
            pushAlert('🎙 Audio / sound detected');
            toast.error('🎙 Audio detected! Please stay silent.', { duration: 3000 });
            reportEvent('audio_detected', 'medium', { rms: Math.round(rms) });
          }
        } else {
          setAiStatus(s => ({ ...s, audioDetected: false }));
        }
        audioRafRef.current = requestAnimationFrame(poll);
      };
      audioRafRef.current = requestAnimationFrame(poll);
    } catch {
      toast.warning('Microphone access denied — audio monitoring disabled.');
    }
  }, [pushAlert, reportEvent]);

  const stopAudioMonitoring = useCallback(() => {
    if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    audioRafRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
    setAudioActive(false);
  }, []);

  // ─── Camera + MediaPipe Face Landmarker ─────────────────────────────────────

  const startCamera = useCallback(async () => {
    let stream = camStreamRef.current;
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 }, audio: false,
      });
      camStreamRef.current = stream;
    }
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
    setCameraOn(true);
    return stream;
  }, []);

  const loadFaceLandmarker = useCallback(async () => {
    if (faceLandmarkerRef.current) return faceLandmarkerRef.current;
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const resolver = await FilesetResolver.forVisionTasks(WASM_URL);
    const landmarker = await FaceLandmarker.createFromOptions(resolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 2,
      outputFacialTransformationMatrixes: true,
    });
    faceLandmarkerRef.current = landmarker;
    return landmarker;
  }, []);

  const runDetection = useCallback(() => {
    const landmarker = faceLandmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video || video.readyState < 2) {
      detectRafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    let result: any;
    try {
      result = landmarker.detectForVideo(video, performance.now());
    } catch {
      detectRafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const faces = result?.faceLandmarks?.length ?? 0;
    const now = Date.now();

    // No face in frame
    if (faces === 0) {
      setGazeDir('none');
      setAiStatus(s => ({ ...s, faceDetected: false, facesCount: 0, eyeGaze: 'unknown', headPose: 'abnormal' }));
      if (now - lastFaceAlertRef.current > FACE_COOLDOWN) {
        lastFaceAlertRef.current = now;
        pushAlert('👤 No face detected in frame');
        toast.error('👤 Face not detected — stay in view!', { duration: 3000 });
        reportEvent('face_not_detected', 'medium');
      }
      detectRafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    // Multiple people
    if (faces > 1 && now - lastFaceAlertRef.current > FACE_COOLDOWN) {
      lastFaceAlertRef.current = now;
      pushAlert(`👥 Multiple faces detected (${faces})`);
      toast.error('👥 Multiple people detected!', { duration: 3000 });
      reportEvent('multiple_faces', 'high', { count: faces });
    }

    // Head-pose / gaze from primary face landmarks
    const lm = result.faceLandmarks[0];
    const noseX = lm[1].x, leftX = lm[234].x, rightX = lm[454].x;
    const noseY = lm[1].y, topY = lm[10].y, chinY = lm[152].y;
    const hRatio = (noseX - leftX) / (rightX - leftX || 1e-6); // ~0.5 = centred
    const vRatio = (noseY - topY) / (chinY - topY || 1e-6);    // ~0.5 = centred

    let dir: GazeDir = 'center';
    if (hRatio < 0.42) dir = 'right';
    else if (hRatio > 0.58) dir = 'left';
    else if (vRatio < 0.40) dir = 'up';
    else if (vRatio > 0.74) dir = 'down';

    const away = dir !== 'center';
    setGazeDir(dir);
    setAiStatus(s => ({
      ...s,
      faceDetected: true,
      facesCount: faces,
      eyeGaze: away ? 'away' : 'screen',
      headPose: away ? 'abnormal' : 'normal',
    }));

    // Flag only sustained look-aways, with cooldown
    if (away) {
      if (awayStartRef.current === null) awayStartRef.current = now;
      if (now - awayStartRef.current > GAZE_AWAY_MS && now - lastGazeAlertRef.current > GAZE_COOLDOWN) {
        lastGazeAlertRef.current = now;
        pushAlert(`👀 Looking ${dir} — eyes off screen`);
        toast.warning(`👀 Looking ${dir} — keep eyes on screen!`, { duration: 2500 });
        reportEvent('looking_away', 'low', { direction: dir });
      }
    } else {
      awayStartRef.current = null;
    }

    detectRafRef.current = requestAnimationFrame(runDetection);
  }, [pushAlert, reportEvent]);

  const startFaceMonitoring = useCallback(async () => {
    try {
      await startCamera();
      await loadFaceLandmarker();
      if (detectRafRef.current === null) {
        detectRafRef.current = requestAnimationFrame(runDetection);
      }
    } catch {
      toast.warning('Camera access denied — gaze monitoring disabled.');
    }
  }, [startCamera, loadFaceLandmarker, runDetection]);

  const stopFaceMonitoring = useCallback(() => {
    if (detectRafRef.current) cancelAnimationFrame(detectRafRef.current);
    detectRafRef.current = null;
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
    }
    if (faceLandmarkerRef.current) {
      try { faceLandmarkerRef.current.close(); } catch { /* noop */ }
      faceLandmarkerRef.current = null;
    }
    awayStartRef.current = null;
    setCameraOn(false);
  }, []);

  // Safety net: release camera + mic if the component unmounts in any phase
  useEffect(() => {
    return () => {
      stopFaceMonitoring();
      stopAudioMonitoring();
    };
  }, [stopFaceMonitoring, stopAudioMonitoring]);

  // Verify identity by actually detecting a face on camera
  const verifyIdentity = useCallback(async () => {
    setVerifying(true);
    try {
      await startCamera();
      const landmarker = await loadFaceLandmarker();
      const video = videoRef.current!;
      const deadline = Date.now() + 7000;
      const found = await new Promise<boolean>(resolve => {
        const tick = () => {
          if (video.readyState >= 2) {
            try {
              const r = landmarker.detectForVideo(video, performance.now());
              if ((r?.faceLandmarks?.length ?? 0) > 0) return resolve(true);
            } catch { /* not ready */ }
          }
          if (Date.now() > deadline) return resolve(false);
          requestAnimationFrame(tick);
        };
        tick();
      });
      if (found) {
        setFaceOk(true);
        setAiStatus(s => ({ ...s, faceVerified: true, faceDetected: true }));
        toast.success('Identity verified — face detected.');
      } else {
        toast.error('No face detected. Make sure your face is clearly visible.');
      }
    } catch {
      toast.error('Camera access denied — cannot verify identity.');
    } finally {
      setVerifying(false);
    }
  }, [startCamera, loadFaceLandmarker]);

  // ─── Assessment phase: timer + fullscreen + audio ────────────────────────────────

  useEffect(() => {
    if (phase !== 'assessment') return;

    // Start timer
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { handleSubmit(); return 0; }
        return t - 1;
      });
    }, 1000);

    // Enter fullscreen
    enterFullscreen();

    // Start audio monitoring
    startAudioMonitoring();

    // Start camera + face / gaze monitoring
    startFaceMonitoring();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAudioMonitoring();
      stopFaceMonitoring();
      if (audioAlertRef.current) clearTimeout(audioAlertRef.current);
    };
  }, [phase]);

  // ─── Live-status heartbeat → recruiters/admins ──────────────────────────────

  const captureCameraFrame = useCallback((): string | undefined => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return undefined;
    let canvas = frameCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      frameCanvasRef.current = canvas;
    }
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, 320, 240);
    return canvas.toDataURL('image/jpeg', 0.55);
  }, []);

  useEffect(() => {
    if (phase !== 'assessment') return;
    const sid = sessionIdRef.current;
    if (!sid) return;
    const beat = () => {
      const cameraFrame = captureCameraFrame();
      sessionsApi
        .heartbeat(sid, {
          ...aiStatusRef.current,
          fullscreen: !!document.fullscreenElement,
          ...(cameraFrame ? { cameraFrame } : {}),
        })
        .catch(() => {});
    };
    beat();
    const h = setInterval(beat, 3000);
    return () => clearInterval(h);
  }, [phase, captureCameraFrame]);

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopAudioMonitoring();
    stopFaceMonitoring();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        const session = await sessionsApi.submit(sid);
        setSubmittedSession(session);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Submission failed');
      }
    }
    setPhase('submitted');
  };

  const answered = Object.keys(answers).length;
  const pct = questions.length > 0 ? Math.round((answered / questions.length) * 100) : 0;
  const q = questions[currentQ];

  // ─── Loading / selection guards ─────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-16 text-center text-sm text-muted-foreground">Loading assessment…</div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" onClick={() => navigate('/candidate/dashboard')}>Back to Dashboard</Button>
        </div>
      </AppLayout>
    );
  }

  if (!assessment) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-4 py-8">
          <div>
            <h1 className="text-xl font-bold text-balance">Available Assessments</h1>
            <p className="text-muted-foreground text-sm mt-1">Select an active assessment to begin.</p>
          </div>
          {availableList.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
              No active assessments are available right now.
            </div>
          ) : (
            <div className="space-y-2">
              {availableList.map(a => (
                <Link
                  key={a.id}
                  to={`/candidate/assessment/${a.id}`}
                  className="flex items-center gap-3 p-4 bg-card hover:bg-accent/50 rounded-md border border-border transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.duration} minutes · {a.totalQuestions} questions</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ─── Pre-flight ────────────────────────────────────────────────────────────

  if (phase === 'preflight') {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-xl font-bold text-balance">{assessment.title}</h1>
            <p className="text-muted-foreground text-sm mt-1">{assessment.duration} minutes · {questions.length} questions</p>
          </div>

          <div className="bg-card border border-border rounded-md p-6 space-y-4">
            <h2 className="font-semibold">Pre-Assessment Checklist</h2>
            <div className="space-y-3">
              {[
                { label: 'Stable internet connection', ok: true, icon: Wifi },
                { label: 'Camera access granted', ok: true, icon: Camera },
                { label: 'Microphone access (audio monitoring)', ok: true, icon: Mic },
                { label: 'Quiet environment — audio is monitored', ok: true, icon: Volume2 },
                { label: 'No mobile devices', ok: true, icon: Smartphone },
                { label: 'Full screen will be enforced on start', ok: true, icon: Maximize },
              ].map(({ label, ok, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3 p-3 bg-muted/50 rounded border border-border">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1 min-w-0">{label}</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
              ))}
            </div>

            {/* Face verification */}
            <div className="border border-border rounded-md p-4">
              <p className="text-sm font-medium mb-3">Face Verification</p>
              <div className="aspect-video bg-muted rounded border border-dashed border-border flex items-center justify-center mb-3 relative overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay muted playsInline
                  className={`w-full h-full object-cover -scale-x-100 ${cameraOn ? '' : 'hidden'}`}
                />
                {!cameraOn && (
                  <div className="text-center">
                    <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Camera preview</p>
                  </div>
                )}
                {faceOk && cameraOn && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/90 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                    <Eye className="w-3 h-3" /> Verified
                  </div>
                )}
              </div>
              {!faceOk ? (
                <Button onClick={verifyIdentity}
                  disabled={verifying} className="w-full" variant="secondary">
                  {verifying ? 'Detecting face…' : 'Verify My Identity'}
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-green-500 text-sm justify-center">
                  <Shield className="w-4 h-4" /> Identity confirmed
                </div>
              )}
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-600 dark:text-amber-400">
              <strong>Important:</strong> The assessment runs in fullscreen mode. <strong>Switching tabs, applications, or windows will immediately end your assessment</strong> and flag it as an integrity violation. Leaving fullscreen or making sounds will also be flagged.
            </div>

            <Button onClick={beginAssessment} disabled={!faceOk || starting} className="w-full">
              {starting ? 'Starting…' : 'Begin Assessment (Fullscreen)'}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ─── Submitted ─────────────────────────────────────────────────────────────

  if (phase === 'submitted') {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center mx-auto">
            <Shield className="w-10 h-10 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-balance">Assessment Submitted!</h1>
            <p className="text-muted-foreground mt-2">Your answers have been securely submitted.</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Answered',       value: `${answered}/${questions.length}` },
              { label: 'Integrity Score', value: submittedSession ? Math.round(submittedSession.integrityScore).toString() : '—' },
              { label: 'Risk Score',      value: submittedSession ? Math.round(submittedSession.riskScore).toString() : aiStatus.riskScore.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border border-border rounded-md p-4">
                <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Results will be available within 24 hours.</p>
          <Button onClick={() => navigate('/candidate/dashboard')}>Back to Dashboard</Button>
        </div>
      </AppLayout>
    );
  }

  if (phase === 'terminated') {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
          <div className="w-20 h-20 rounded-full bg-destructive/10 border-2 border-destructive flex items-center justify-center mx-auto">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-balance text-destructive">Assessment Terminated</h1>
            <p className="text-muted-foreground mt-2">
              Your assessment was ended automatically because you left the assessment tab.
            </p>
          </div>
          <div className="bg-destructive/5 border border-destructive/30 rounded-md p-4 text-left space-y-2">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                <span className="font-semibold">Integrity violation:</span> {terminationReason || 'Tab / application switch detected'}.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              This incident has been flagged and recorded for review by the recruiter. Switching tabs,
              applications, or windows during a monitored assessment is not permitted.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Answered',       value: `${answered}/${questions.length}` },
              { label: 'Tab Switches',   value: aiStatus.tabSwitches.toString() },
              { label: 'Risk Score',     value: aiStatus.riskScore.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border border-border rounded-md p-4">
                <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={() => navigate('/candidate/dashboard')}>Back to Dashboard</Button>
        </div>
      </AppLayout>
    );
  }

  // ─── Assessment UI ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-card border border-border rounded-md px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate text-balance">{assessment.title}</h1>
            <p className="text-xs text-muted-foreground">Q{currentQ + 1}/{questions.length}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap shrink-0">
            {/* Fullscreen indicator */}
            <button
              onClick={enterFullscreen}
              title={isFullscreen ? 'Fullscreen active' : 'Click to restore fullscreen'}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${isFullscreen ? 'border-green-500/30 bg-green-500/10 text-green-500' : 'border-destructive/40 bg-destructive/10 text-destructive animate-pulse'}`}
            >
              <Maximize className="w-3.5 h-3.5" />
              {isFullscreen ? 'Fullscreen' : 'Restore FS'}
            </button>
            {/* Audio indicator */}
            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${aiStatus.audioDetected ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-green-500/30 bg-green-500/10 text-green-500'}`}>
              <Mic className="w-3.5 h-3.5" />
              {aiStatus.audioDetected ? 'Audio!' : audioActive ? 'Mic On' : 'No Mic'}
            </span>
            {/* Tab switch count */}
            {aiStatus.tabSwitches > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-destructive/40 bg-destructive/10 text-destructive">
                <Monitor className="w-3.5 h-3.5" />
                {aiStatus.tabSwitches} switch{aiStatus.tabSwitches > 1 ? 'es' : ''}
              </span>
            )}
            <div className={`flex items-center gap-1.5 font-mono font-bold text-sm ${timeLeft < 300 ? 'text-destructive' : 'text-foreground'}`}>
              <Clock className="w-4 h-4 shrink-0" />
              {fmt(timeLeft)}
            </div>
            <RiskBadge level={aiStatus.riskLevel} score={aiStatus.riskScore} />
            <Button size="sm" variant="destructive" onClick={handleSubmit}>
              <Send className="w-3.5 h-3.5 mr-1.5" /> Submit
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Question area */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-card border border-border rounded-md p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">Q{currentQ + 1}</span>
                <span className="text-xs text-muted-foreground">{q?.marks} mark{q?.marks !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-sm md:text-base font-medium text-foreground mb-5 leading-relaxed text-pretty">{q?.text}</p>
              {q?.type === 'coding' ? (
                <CodeEditor
                  key={q.id}
                  languages={q.languages ?? (q.language ? [q.language] : ['javascript'])}
                  entryPoint={q.entryPoint ?? ''}
                  starterCodes={q.starterCodes ?? (q.language && q.starterCode ? { [q.language]: q.starterCode } : undefined)}
                  testCases={q.testCases}
                  value={(answers[q.id] as string) ?? ''}
                  onChange={code => recordAnswer(q, code)}
                />
              ) : q?.type === 'short_answer' ? (
                <textarea
                  className="w-full min-h-32 p-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  placeholder="Type your answer here…"
                  value={answers[q.id] as string || ''}
                  onChange={e => recordAnswer(q, e.target.value)}
                />
              ) : (
                <div className="space-y-2">
                  {q?.options?.map((opt, i) => (
                    <label key={i} className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors min-h-12 ${answers[q.id] === i ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                      <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === i}
                        onChange={() => recordAnswer(q, i)} className="shrink-0" />
                      <span className="text-sm text-foreground">{opt}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button variant="outline" disabled={currentQ === 0} onClick={() => setCurrentQ(c => c - 1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {questions.slice(0, 8).map((_, i) => (
                  <button key={i} onClick={() => setCurrentQ(i)}
                    className={`w-7 h-7 rounded text-xs font-medium transition-colors ${i === currentQ ? 'bg-primary text-primary-foreground' : answers[questions[i].id] !== undefined ? 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30' : 'bg-muted text-muted-foreground border border-border'}`}>
                    {i + 1}
                  </button>
                ))}
              </div>
              <Button variant="outline" disabled={currentQ === questions.length - 1} onClick={() => setCurrentQ(c => c + 1)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* AI Monitoring Panel */}
          <div className="bg-card border border-border rounded-md p-4 space-y-4 h-fit">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary shrink-0" />
              <h3 className="text-sm font-semibold">AI Monitoring</h3>
              <span className="ml-auto flex items-center gap-1 text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 ai-active" /> LIVE
              </span>
            </div>

            {/* Live camera + gaze detection */}
            <div className="aspect-video bg-muted rounded border border-border/50 flex items-center justify-center relative overflow-hidden">
              <video
                ref={videoRef}
                autoPlay muted playsInline
                className={`w-full h-full object-cover -scale-x-100 ${cameraOn ? '' : 'hidden'}`}
              />
              {!cameraOn && <Camera className="w-8 h-8 text-muted-foreground" />}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-primary/60" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-primary/60" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-primary/60" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-primary/60" />
              </div>
              {cameraOn && (
                <div className={`absolute bottom-1.5 left-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  gazeDir === 'center' ? 'bg-green-500/85 text-white'
                  : gazeDir === 'none' ? 'bg-destructive/85 text-white'
                  : 'bg-amber-500/90 text-white'
                }`}>
                  {gazeDir === 'center' ? 'On screen'
                    : gazeDir === 'none' ? 'No face'
                    : `Looking ${gazeDir}`}
                </div>
              )}
            </div>

            {/* Status indicators */}
            <div className="space-y-1.5">
              <StatusDot active={aiStatus.faceDetected}        label="Face Detected" />
              <StatusDot active={aiStatus.faceVerified}        label="Identity Verified" />
              <StatusDot active={aiStatus.eyeGaze === 'screen'} label="Eyes on Screen" />
              <StatusDot active={!aiStatus.phoneDetected}      label="No Phone Detected" />
              <StatusDot active={!aiStatus.audioDetected}      label={aiStatus.audioDetected ? 'Audio Detected!' : 'Audio Clear'} />
              <StatusDot active={aiStatus.browserFocused}      label={aiStatus.browserFocused ? 'Browser Focused' : 'Focus Lost!'} />
              <StatusDot active={isFullscreen}                 label={isFullscreen ? 'Fullscreen Active' : 'Fullscreen Exited!'} />
            </div>

            {/* Progress */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Progress</span>
                <span className="text-xs font-mono text-foreground">{answered}/{questions.length}</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>

            {/* Tab switches */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Tab Switches</span>
              <span className={`font-mono font-bold ${aiStatus.tabSwitches > 0 ? 'text-destructive' : 'text-green-500'}`}>
                {aiStatus.tabSwitches}
              </span>
            </div>

            {/* Alerts log */}
            {alerts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Alerts ({alerts.length})
                </p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {alerts.map((a, i) => (
                    <div key={i} className="text-xs bg-destructive/10 px-2 py-1.5 rounded border border-destructive/20">
                      <p className="text-destructive font-medium truncate">{a.msg}</p>
                      <p className="text-muted-foreground text-[10px] mt-0.5 font-mono">{a.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AssessmentScreen;
