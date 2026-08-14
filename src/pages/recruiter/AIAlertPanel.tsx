import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { SeverityBadge } from '@/components/shared/StatusBadges';
import { alertsApi, evidenceApi, type ApiEvidence } from '@/lib/api';
import { mapAlert } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  AlertTriangle, Search, CheckCircle2, Filter, Loader2, Brain,
  Play, SkipForward, SkipBack, Volume2, VolumeX,
  X, ShieldAlert, Activity, Clock, Eye, Video,
} from 'lucide-react';
import type { AIAlert, AlertSeverity } from '@/types/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const ALERT_LABELS: Record<string, string> = {
  multiple_faces:      'Multiple Faces Detected',
  phone_detected:      'Phone Detected',
  looking_away:        'Looking Away',
  tab_switch:          'Tab Switch',
  suspicious_movement: 'Suspicious Movement',
  audio_detected:      'Audio Detected',
  face_not_detected:   'Face Not Detected',
  identity_mismatch:   'Identity Mismatch',
  browser_unfocused:   'Browser Unfocused',
  object_detected:     'Object Detected',
};

const ALERT_ICONS: Record<string, React.ReactNode> = {
  multiple_faces:    <Eye className="w-4 h-4" />,
  phone_detected:    <ShieldAlert className="w-4 h-4" />,
  tab_switch:        <Activity className="w-4 h-4" />,
  browser_unfocused: <Activity className="w-4 h-4" />,
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SEV = {
  critical: { dot: 'bg-red-500',    ring: 'ring-red-500/20',    icon: 'text-red-500',    card: 'border-red-500/40 bg-red-500/[0.03]',     bar: 'bg-red-500',    badge: 'bg-red-500/15' },
  high:     { dot: 'bg-orange-500', ring: 'ring-orange-500/20', icon: 'text-orange-500', card: 'border-orange-500/30 bg-orange-500/[0.02]', bar: 'bg-orange-500', badge: 'bg-orange-500/15' },
  medium:   { dot: 'bg-yellow-500', ring: 'ring-yellow-500/20', icon: 'text-yellow-500', card: 'border-yellow-500/20 bg-yellow-500/[0.02]', bar: 'bg-yellow-500', badge: 'bg-yellow-500/15' },
  low:      { dot: 'bg-green-500',  ring: 'ring-green-500/20',  icon: 'text-green-500',  card: 'border-border bg-card',                    bar: 'bg-green-500',  badge: 'bg-green-500/15' },
};

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function candidateLabel(a: AIAlert): string {
  return a.candidateName || `Candidate ${a.candidateId.slice(0, 8)}`;
}

function safeDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'MMM d, HH:mm:ss');
}

function riskColor(score: number) {
  if (score >= 70) return 'text-red-500';
  if (score >= 40) return 'text-orange-500';
  return 'text-green-500';
}

/* ─── Recording Modal ────────────────────────────────────────────────────────── */

interface RecordingModalProps {
  sessionId: string;
  candidateName: string;
  onClose: () => void;
}

const RecordingModal: React.FC<RecordingModalProps> = ({ sessionId, candidateName, onClose }) => {
  const { data: evidenceList, loading } = useAsync(() => evidenceApi.list(sessionId), [sessionId]);
  const clips = (evidenceList ?? []).filter((e): e is ApiEvidence => e.type === 'video');

  const [clipIndex, setClipIndex] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadingClip, setLoadingClip] = useState(false);
  const [muted, setMuted] = useState(false);
  const [continuous, setContinuous] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const currentClip = clips[clipIndex];

  const loadUrl = useCallback(async (clip: ApiEvidence) => {
    if (urls[clip.id]) return;
    setLoadingClip(true);
    try {
      const url = await evidenceApi.objectUrl(clip.id);
      setUrls(prev => ({ ...prev, [clip.id]: url }));
    } catch {
      toast.error('Could not load recording clip.');
    } finally {
      setLoadingClip(false);
    }
  }, [urls]);

  // Load current clip
  useEffect(() => {
    if (currentClip) loadUrl(currentClip);
  }, [currentClip, loadUrl]);

  // Auto-play when url becomes available
  useEffect(() => {
    if (currentClip && urls[currentClip.id] && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => undefined);
    }
  }, [urls, currentClip]);

  // Prefetch next clip for seamless playback
  useEffect(() => {
    const next = clips[clipIndex + 1];
    if (next && !urls[next.id]) loadUrl(next);
  }, [clipIndex, clips, urls, loadUrl]);

  const goTo = (idx: number) => {
    const clip = clips[idx];
    if (!clip) return;
    setClipIndex(idx);
    if (!urls[clip.id]) loadUrl(clip);
  };

  const handleEnded = () => {
    if (continuous && clipIndex < clips.length - 1) goTo(clipIndex + 1);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Video className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{candidateName} — Session Recording</p>
              <p className="text-xs text-muted-foreground">
                {clips.length === 0 ? 'No recordings' : `Clip ${clipIndex + 1} of ${clips.length}`}
                {currentClip?.capturedAt && ` · ${safeDate(currentClip.capturedAt)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMuted(m => !m)}
              title={muted ? 'Unmute' : 'Mute'}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video */}
        <div className="relative bg-black aspect-video w-full flex items-center justify-center">
          {loading || loadingClip ? (
            <div className="flex flex-col items-center gap-3 text-white/60">
              <Loader2 className="w-10 h-10 animate-spin" />
              <span className="text-sm">Loading recording…</span>
            </div>
          ) : clips.length === 0 ? (
            <div className="flex flex-col items-center gap-3 text-white/40">
              <Video className="w-12 h-12" />
              <span className="text-sm">No recordings captured for this session</span>
            </div>
          ) : currentClip && urls[currentClip.id] ? (
            <video
              ref={videoRef}
              key={currentClip.id}
              src={urls[currentClip.id]}
              muted={muted}
              controls
              onEnded={handleEnded}
              className="w-full h-full object-contain"
            />
          ) : (
            <Loader2 className="w-8 h-8 animate-spin text-white/40" />
          )}
        </div>

        {/* Footer controls */}
        {clips.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-muted/30 space-y-3">
            {/* Clip strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {clips.map((clip, i) => (
                <button
                  key={clip.id}
                  onClick={() => goTo(i)}
                  className={cn(
                    'shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors border',
                    i === clipIndex
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  Clip {i + 1}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => goTo(clipIndex - 1)} disabled={clipIndex === 0} className="h-7 px-2">
                  <SkipBack className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => goTo(clipIndex + 1)} disabled={clipIndex >= clips.length - 1} className="h-7 px-2">
                  <SkipForward className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground">{clipIndex + 1} / {clips.length}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
                <div
                  onClick={() => setContinuous(c => !c)}
                  className={cn('w-8 h-4 rounded-full transition-colors relative cursor-pointer', continuous ? 'bg-primary' : 'bg-muted-foreground/30')}
                >
                  <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all', continuous ? 'left-4' : 'left-0.5')} />
                </div>
                Auto-advance clips
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Stat card ──────────────────────────────────────────────────────────────── */

const StatCard: React.FC<{ label: string; value: number; icon: React.ReactNode; bg: string; sub?: string }> =
  ({ label, value, icon, bg, sub }) => (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 min-w-0">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', bg)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/60 truncate">{sub}</p>}
      </div>
    </div>
  );

/* ─── Alert card ─────────────────────────────────────────────────────────────── */

const AlertCard: React.FC<{
  alert: AIAlert;
  onMarkReviewed: (id: string) => void;
  onViewRecording: (alert: AIAlert) => void;
}> = ({ alert, onMarkReviewed, onViewRecording }) => {
  const s = SEV[alert.severity];
  return (
    <div className={cn('border rounded-xl p-4 transition-all duration-200', s.card, alert.reviewed && 'opacity-55')}>
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn('mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-4', s.ring, s.badge)}>
          <span className={s.icon}>{ALERT_ICONS[alert.type] ?? <AlertTriangle className="w-4 h-4" />}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-foreground">{ALERT_LABELS[alert.type] ?? alert.type}</span>
            <SeverityBadge severity={alert.severity} />
            {alert.reviewed && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" /> Reviewed
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed mb-2">{alert.description}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              {candidateLabel(alert)}
            </span>
            <span className="truncate max-w-[220px]">{alert.assessmentTitle.split('–')[0].trim()}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {safeDate(alert.timestamp)}
            </span>
            <span className={cn('font-bold', riskColor(alert.riskScore))}>Risk {alert.riskScore}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 shrink-0 ml-2">
          <Button size="sm" variant="outline" onClick={() => onViewRecording(alert)} className="h-8 text-xs gap-1.5 whitespace-nowrap">
            <Play className="w-3 h-3" /> Recording
          </Button>
          <Button size="sm" variant="secondary" asChild className="h-8 text-xs gap-1.5 whitespace-nowrap">
            <Link to={`/recruiter/review/${alert.sessionId}`}>
              <Brain className="w-3 h-3" /> Review
            </Link>
          </Button>
          {!alert.reviewed && (
            <Button size="sm" variant="ghost" onClick={() => onMarkReviewed(alert.id)} className="h-8 text-xs gap-1.5 whitespace-nowrap text-muted-foreground hover:text-foreground">
              <CheckCircle2 className="w-3 h-3" /> Done
            </Button>
          )}
        </div>
      </div>

      {/* Risk bar */}
      <div className="mt-3 h-0.5 rounded-full overflow-hidden bg-border">
        <div className={cn('h-full rounded-full transition-all', s.bar)} style={{ width: `${alert.riskScore}%` }} />
      </div>
    </div>
  );
};

/* ─── Main panel ─────────────────────────────────────────────────────────────── */

const AIAlertPanel: React.FC = () => {
  const { data, loading, error, reload } = useAsync(() => alertsApi.list({ perPage: 200 }), []);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | 'all'>('all');
  const [filterReviewed, setFilterReviewed] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [recordingAlert, setRecordingAlert] = useState<AIAlert | null>(null);

  const alerts: AIAlert[] = (data?.items ?? [])
    .map(mapAlert)
    .map(a => (reviewedIds.has(a.id) ? { ...a, reviewed: true } : a));

  const filtered = alerts
    .filter(a =>
      (filterSeverity === 'all' || a.severity === filterSeverity) &&
      (filterReviewed === 'all' || (filterReviewed === 'pending' ? !a.reviewed : a.reviewed)) &&
      (search === '' ||
        candidateLabel(a).toLowerCase().includes(search.toLowerCase()) ||
        (ALERT_LABELS[a.type] ?? '').toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const markReviewed = async (id: string) => {
    setReviewedIds(prev => new Set(prev).add(id));
    try {
      await alertsApi.review(id);
      toast.success('Alert marked as reviewed');
    } catch {
      toast.error('Could not update alert');
    }
  };

  const markAllReviewed = async () => {
    const pendingIds = alerts.filter(a => !a.reviewed).map(a => a.id);
    setReviewedIds(prev => { const next = new Set(prev); pendingIds.forEach(id => next.add(id)); return next; });
    try {
      await Promise.all(pendingIds.map(id => alertsApi.review(id)));
      toast.success('All alerts marked as reviewed');
    } catch {
      toast.error('Some alerts could not be updated');
      reload();
    }
  };

  const pending  = alerts.filter(a => !a.reviewed).length;
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const high     = alerts.filter(a => a.severity === 'high').length;

  return (
    <AppLayout>
      {recordingAlert && (
        <RecordingModal
          sessionId={recordingAlert.sessionId}
          candidateName={candidateLabel(recordingAlert)}
          onClose={() => setRecordingAlert(null)}
        />
      )}

      <div className="max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">AI Alert Panel</h1>
            </div>
            <p className="text-muted-foreground text-sm pl-10">Real-time integrity monitoring · {pending} pending review</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={reload} className="h-8 text-xs">Refresh</Button>
            {pending > 0 && (
              <Button size="sm" onClick={markAllReviewed} className="h-8 text-xs gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark All Reviewed
              </Button>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Alerts"    value={alerts.length} icon={<AlertTriangle className="w-5 h-5 text-primary" />}    bg="bg-primary/10" />
          <StatCard label="Critical"        value={critical}      icon={<ShieldAlert className="w-5 h-5 text-red-500" />}       bg="bg-red-500/10" />
          <StatCard label="High Severity"   value={high}          icon={<Activity className="w-5 h-5 text-orange-500" />}       bg="bg-orange-500/10" />
          <StatCard label="Pending Review"  value={pending}       icon={<Clock className="w-5 h-5 text-yellow-500" />}          bg="bg-yellow-500/10" sub={`${alerts.length - pending} reviewed`} />
        </div>

        {/* Severity chips */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map(sev => {
            const count = sev === 'all' ? alerts.length : alerts.filter(a => a.severity === sev).length;
            const active = filterSeverity === sev;
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev === filterSeverity ? 'all' : sev as AlertSeverity | 'all')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                  active
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                {sev !== 'all' && (
                  <span className={cn('w-1.5 h-1.5 rounded-full', { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-green-500' }[sev])} />
                )}
                {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
                <span className={cn('ml-0.5 tabular-nums', active ? 'text-primary-foreground/70' : 'text-muted-foreground/70')}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search + status filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search candidate or alert type…" className="pl-9 h-9" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['all', 'pending', 'reviewed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterReviewed(f)}
                  className={cn('px-3 py-1.5 text-xs transition-colors capitalize font-medium', filterReviewed === f ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Alert list */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
              <p className="text-muted-foreground text-sm">Loading alerts…</p>
            </div>
          ) : error ? (
            <div className="bg-card border border-destructive/30 rounded-xl p-12 text-center">
              <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
              <p className="text-foreground text-sm font-medium mb-1">Failed to load alerts</p>
              <p className="text-muted-foreground text-xs mb-4">{error}</p>
              <Button size="sm" variant="outline" onClick={reload}>Retry</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-foreground font-semibold">No alerts match your filter</p>
              <p className="text-muted-foreground text-sm mt-1">All clear!</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Showing {filtered.length} of {alerts.length} alerts</p>
              {filtered.map(alert => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onMarkReviewed={markReviewed}
                  onViewRecording={setRecordingAlert}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default AIAlertPanel;
