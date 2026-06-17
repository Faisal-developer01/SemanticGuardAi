import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { RiskBadge, StatusDot } from '@/components/shared/StatusBadges';
import { sessionsApi, type ApiAlert, type ApiLiveSession } from '@/lib/api';
import { useAsync } from '@/lib/useApi';
import { mapLiveSession } from '@/lib/mappers';
import { useMonitoringFeed } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, Eye, VideoOff } from 'lucide-react';
import { toast } from 'sonner';
import type { LiveCandidate } from '@/types/types';
import { cn } from '@/lib/utils';

const ALERT_LABELS: Record<string, string> = {
  multiple_faces: 'Multiple faces detected',
  phone_detected: 'Phone detected',
  looking_away: 'Looking away from screen',
  tab_switch: 'Tab switch detected',
  audio_detected: 'Suspicious audio',
  face_not_detected: 'Face not detected',
  identity_mismatch: 'Identity mismatch',
  browser_unfocused: 'Browser unfocused',
  object_detected: 'Suspicious object detected',
  suspicious_movement: 'Suspicious movement',
};

const EMPTY: ApiLiveSession[] = [];

const CandidateCard: React.FC<{ candidate: LiveCandidate; onClick: () => void; selected: boolean }> = ({ candidate, onClick, selected }) => {
  const s = candidate.status;
  return (
    <button
      onClick={onClick}
      className={cn(
        'bg-card border rounded-md p-3 text-left w-full transition-all',
        candidate.isFlagged ? 'border-destructive/40 flagged-card' : 'border-border hover:border-primary/30',
        selected && 'ring-2 ring-primary border-primary'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{candidate.name}</p>
          <p className="text-xs text-muted-foreground">{candidate.candidateId}</p>
        </div>
        <RiskBadge level={s.riskLevel} score={s.riskScore} className="shrink-0" />
      </div>
      {/* Live webcam feed from candidate */}
      <div className="relative aspect-video bg-muted rounded border border-border/50 flex items-center justify-center mb-2 overflow-hidden">
        {candidate.status.cameraFrame ? (
          <img
            src={candidate.status.cameraFrame}
            alt={`${candidate.name} live feed`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <VideoOff className="w-6 h-6" />
            <span className="text-[10px]">Waiting for camera…</span>
          </div>
        )}
        {/* Bounding box overlay */}
        {s.faceDetected && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[20%] left-[25%] w-[50%] h-[60%] border border-primary/60" />
            <div className="absolute top-[20%] left-[25%] w-2 h-2 border-t border-l border-primary" />
            <div className="absolute top-[20%] right-[25%] w-2 h-2 border-t border-r border-primary" />
            <div className="absolute bottom-[20%] left-[25%] w-2 h-2 border-b border-l border-primary" />
            <div className="absolute bottom-[20%] right-[25%] w-2 h-2 border-b border-r border-primary" />
          </div>
        )}
        {candidate.isFlagged && (
          <div className="absolute top-1 left-1 flex items-center gap-1 bg-destructive/80 px-1.5 py-0.5 rounded text-xs text-white">
            <AlertTriangle className="w-3 h-3" /> FLAGGED
          </div>
        )}
        <div className="absolute bottom-1 right-1 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-xs text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 ai-active" /> LIVE
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <StatusDot active={s.faceDetected} label="Face" />
        <StatusDot active={!s.phoneDetected} label="No Phone" />
        <StatusDot active={s.eyeGaze === 'screen'} label="On Screen" />
        <StatusDot active={s.browserFocused} label="Focused" />
      </div>
      {candidate.alertCount > 0 && (
        <div className="mt-2 text-xs text-destructive font-medium flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {candidate.alertCount} alert{candidate.alertCount !== 1 ? 's' : ''}
        </div>
      )}
    </button>
  );
};

const LiveMonitoring: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'flagged'>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const handleRealtimeAlert = (alert: ApiAlert) => {
    const label = ALERT_LABELS[alert.type ?? ''] ?? alert.type ?? 'Suspicious activity';
    toast.warning(label, {
      description: alert.description ?? 'A candidate was flagged during the assessment.',
      duration: 8000,
      action: { label: 'Review', onClick: () => { window.location.href = '/recruiter/alerts'; } },
    });
  };

  const { data: initial } = useAsync(() => sessionsApi.live(), []);
  const { sessions, connected } = useMonitoringFeed(initial ?? EMPTY, { onAlert: handleRealtimeAlert });
  const candidates = sessions.map(mapLiveSession);
  const flaggedCount = candidates.filter(s => s.isFlagged).length;

  const displayed = filter === 'flagged' ? candidates.filter(s => s.isFlagged) : candidates;
  const selectedCandidate = candidates.find(s => s.id === selected);

  return (
    <AppLayout>
      <div className="space-y-4 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">Live Monitoring</h1>
            <p className="text-muted-foreground text-sm mt-0.5 truncate">{candidates.length} candidate{candidates.length !== 1 ? 's' : ''} under active proctoring</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className={cn('flex items-center gap-1.5 rounded px-2 py-1 border', connected ? 'bg-green-500/10 border-green-500/20' : 'bg-muted border-border')}>
              <span className={cn('w-2 h-2 rounded-full', connected ? 'bg-green-500 ai-active' : 'bg-muted-foreground')} />
              <span className={cn('text-xs font-medium', connected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>{connected ? 'Live feed connected' : 'Connecting…'}</span>
            </div>
            <span className="text-xs text-muted-foreground">{candidates.length} candidates</span>
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['all', 'flagged'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn('px-3 py-1.5 text-xs transition-colors capitalize flex items-center gap-1.5', filter === f ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                >
                  {f === 'flagged' && <AlertTriangle className="w-3 h-3" />}
                  {f === 'flagged' ? `Flagged (${flaggedCount})` : 'All Candidates'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Alert banner */}
        {flaggedCount > 0 && (
          <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-destructive">
                {flaggedCount} candidate{flaggedCount !== 1 ? 's' : ''} flagged for suspicious activity
              </p>
              <p className="text-xs text-destructive/80 mt-0.5">Click on flagged cards for details</p>
            </div>
            <Button size="sm" variant="destructive" className="shrink-0" asChild>
              <a href="/recruiter/alerts">Review Alerts</a>
            </Button>
          </div>
        )}

        <div className="flex gap-4">
          {/* Candidate grid */}
          <div className="flex-1 min-w-0">
            {displayed.length === 0 ? (
              <div className="border border-dashed border-border rounded-md py-20 flex flex-col items-center justify-center text-center text-muted-foreground">
                <Eye className="w-8 h-8 mb-3 opacity-40" />
                <p className="text-sm font-medium text-foreground">No active sessions</p>
                <p className="text-xs mt-1">{filter === 'flagged' ? 'No flagged candidates right now.' : 'Candidates will appear here when they begin an assessment.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {displayed.map(candidate => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    onClick={() => setSelected(selected === candidate.id ? null : candidate.id)}
                    selected={selected === candidate.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedCandidate && (
            <div className="w-72 shrink-0 bg-card border border-border rounded-md p-4 space-y-4 h-fit sticky top-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Candidate Details</h3>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">{selectedCandidate.name}</p>
                <p className="text-xs text-muted-foreground">{selectedCandidate.candidateId}</p>
              </div>
              {selectedCandidate.status.cameraFrame && (
                <div className="relative aspect-video bg-muted rounded border border-border overflow-hidden">
                  <img
                    src={selectedCandidate.status.cameraFrame}
                    alt={`${selectedCandidate.name} live feed`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 right-1 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-xs text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 ai-active" /> LIVE
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Status</p>
                <div className="space-y-1.5">
                  <StatusDot active={selectedCandidate.status.faceDetected} label="Face Detected" />
                  <StatusDot active={selectedCandidate.status.faceVerified} label="Identity Verified" />
                  <StatusDot active={selectedCandidate.status.eyeGaze === 'screen'} label="Eyes on Screen" />
                  <StatusDot active={selectedCandidate.status.headPose === 'normal'} label="Head Pose Normal" />
                  <StatusDot active={!selectedCandidate.status.phoneDetected} label="No Phone" />
                  <StatusDot active={!selectedCandidate.status.audioDetected} label="Audio Clear" />
                  <StatusDot active={!selectedCandidate.status.suspiciousMovement} label="No Suspicious Movement" />
                  <StatusDot active={selectedCandidate.status.browserFocused} label="Browser Focused" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Metrics</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Tab Switches', value: selectedCandidate.status.tabSwitches },
                    { label: 'Risk Score', value: selectedCandidate.status.riskScore },
                    { label: 'Faces Count', value: selectedCandidate.status.facesCount },
                    { label: 'Alerts', value: selectedCandidate.alertCount },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/50 rounded p-2 border border-border">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-mono font-bold text-sm text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <RiskBadge level={selectedCandidate.status.riskLevel} score={selectedCandidate.status.riskScore} className="w-full justify-center" />
              {selectedCandidate.isFlagged && (
                <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2 rounded">
                  <Shield className="w-3.5 h-3.5 shrink-0" /> High-risk candidate flagged
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default LiveMonitoring;
