import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { RiskBadge, SeverityBadge, StatusDot } from '@/components/shared/StatusBadges';
import { assessmentsApi, sessionsApi } from '@/lib/api';
import { mapAssessment, mapAlert, mapSession } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { Shield, CheckCircle2, XCircle, Calendar, Clock, Eye, ArrowLeft, Loader2 } from 'lucide-react';

const ALERT_LABELS: Record<string, string> = {
  looking_away: 'Looking Away', tab_switch: 'Tab Switch', phone_detected: 'Phone Detected',
  multiple_faces: 'Multiple Faces', audio_detected: 'Audio Detected',
  face_not_detected: 'Face Not Detected', browser_unfocused: 'Browser Unfocused',
};

function safeDate(value: string, fmt: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, fmt);
}

const AssessmentResults: React.FC = () => {
  const { sessionId: id } = useParams<{ sessionId: string }>();
  const { data: apiSession, loading, error } = useAsync(() => (id ? sessionsApi.get(id) : Promise.resolve(null)), [id]);
  const { data: apiAlerts } = useAsync(() => (id ? sessionsApi.alerts(id) : Promise.resolve([])), [id]);
  const { data: apiAssessment } = useAsync(
    () => (apiSession ? assessmentsApi.get(apiSession.assessmentId) : Promise.resolve(null)),
    [apiSession],
  );

  const session = apiSession
    ? { ...mapSession(apiSession), alerts: (apiAlerts ?? []).map(mapAlert) }
    : null;
  const assessment = apiAssessment ? mapAssessment(apiAssessment) : null;
  const title = assessment?.title || (session ? `Assessment ${session.assessmentId.slice(0, 8)}` : 'Result');
  const durationLabel = assessment ? `${assessment.duration} minutes` : '—';

  if (loading || (!session && !error)) {
    return (
      <AppLayout>
        <div className="max-w-3xl py-20 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading result…
        </div>
      </AppLayout>
    );
  }

  if (error || !session) {
    return (
      <AppLayout>
        <div className="max-w-3xl py-20 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error ?? 'Result not found.'}</p>
          <Button variant="outline" asChild><Link to="/candidate/history">Back to History</Link></Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/candidate/history"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Link>
          </Button>
          <h1 className="text-xl font-bold text-balance flex-1 min-w-0 truncate">{title}</h1>
        </div>

        {/* Score card */}
        <div className="bg-card border border-border rounded-md p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">{safeDate(session.startTime, 'MMMM d, yyyy')}</span>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">{durationLabel}</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Score</span>
                    <span className="text-xs font-mono text-foreground">{session.score ?? 0}/{session.maxScore}</span>
                  </div>
                  <Progress value={session.percentage ?? 0} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Integrity</span>
                    <span className="text-xs font-mono text-foreground">{session.integrityScore}/100</span>
                  </div>
                  <Progress value={session.integrityScore} className="h-2" />
                </div>
              </div>
            </div>

            <div className="flex flex-row md:flex-col gap-4 md:gap-2 shrink-0 items-center">
              <div className="text-center">
                <p className="text-4xl font-bold font-mono text-foreground">{session.percentage}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">Final Score</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold font-mono ${session.integrityScore >= 80 ? 'text-green-500' : session.integrityScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {session.integrityScore}
                </p>
                <p className="text-xs text-muted-foreground">Integrity</p>
              </div>
            </div>
          </div>
        </div>

        {/* AI Summary */}
        <div className="bg-card border border-border rounded-md p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">AI Monitoring Summary</h2>
            <RiskBadge level={session.riskLevel} score={session.riskScore} className="ml-auto" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Tab Switches', value: session.tabSwitches, bad: session.tabSwitches > 0 },
              { label: 'Looking Away', value: session.lookingAwayCount, bad: session.lookingAwayCount > 3 },
              { label: 'Face Not Detected', value: session.faceNotDetectedCount, bad: session.faceNotDetectedCount > 0 },
              { label: 'AI Alerts', value: session.alerts.length, bad: session.alerts.length > 0 },
              { label: 'Risk Score', value: session.riskScore, bad: session.riskScore > 30 },
              { label: 'Status', value: session.riskLevel.toUpperCase(), bad: session.riskLevel !== 'low' },
            ].map(({ label, value, bad }) => (
              <div key={label} className="p-3 bg-muted/50 rounded border border-border">
                <div className="flex items-center gap-2 mb-1">
                  {bad ? <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className={`text-sm font-bold font-mono ${bad ? 'text-destructive' : 'text-green-500'}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Active AI detectors */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Detection Systems Active</p>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Face Detection', active: true },
                { label: 'Eye Tracking', active: true },
                { label: 'Phone Detection', active: true },
                { label: 'Tab Monitor', active: true },
                { label: 'Audio Detection', active: false },
              ].map(({ label, active }) => (
                <StatusDot key={label} active={active} label={label} />
              ))}
            </div>
          </div>
        </div>

        {/* Alert details */}
        {session.alerts.length > 0 && (
          <div className="bg-card border border-border rounded-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4 text-destructive" />
              <h2 className="font-semibold text-sm">Alert Details</h2>
            </div>
            <div className="space-y-2">
              {session.alerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 p-3 bg-destructive/5 border border-destructive/20 rounded">
                  <SeverityBadge severity={alert.severity} className="shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{ALERT_LABELS[alert.type] ?? alert.type}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{safeDate(alert.timestamp, 'HH:mm:ss')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" asChild className="flex-1">
            <Link to="/candidate/history">← Back to History</Link>
          </Button>
          <Button asChild className="flex-1">
            <Link to="/candidate/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default AssessmentResults;
