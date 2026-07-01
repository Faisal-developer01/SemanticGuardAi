import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { RiskBadge, SeverityBadge } from '@/components/shared/StatusBadges';
import {
  sessionsApi,
  alertsApi,
  evidenceApi,
  type ApiAlert,
  type ApiEvidence,
  type CodeIntegrityItem,
  type RiskFactor,
} from '@/lib/api';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  ShieldAlert,
  Activity,
  ListChecks,
  CheckCircle2,
  XCircle,
  Printer,
  Clock,
  Brain,
  MonitorPlay,
  Fingerprint,
  Play,
  FileCode2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SEVERITY_BAR: Record<string, string> = {
  critical: 'bg-destructive',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-sky-500',
};

function safeTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'MMM d, HH:mm:ss');
}

const FactorRow: React.FC<{ factor: RiskFactor; max: number }> = ({ factor, max }) => {
  const width = max > 0 ? Math.max(4, Math.round((factor.contribution / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-foreground truncate">{factor.label}</span>
          <span className="text-xs text-muted-foreground shrink-0">×{factor.count}</span>
        </span>
        <span className="font-mono font-semibold text-foreground shrink-0">
          +{factor.contribution.toFixed(0)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full', SEVERITY_BAR[factor.severity] ?? 'bg-primary')}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
};

const DEVICE_LABELS: Record<string, string> = {
  userAgent: 'Browser',
  platform: 'Platform',
  timezone: 'Timezone',
  screen: 'Screen',
  hardwareConcurrency: 'CPU Cores',
  deviceMemory: 'Memory (GB)',
  webglRenderer: 'GPU',
  language: 'Language',
};

const DeviceInfoPanel: React.FC<{ fingerprint?: string | null; info?: Record<string, unknown> | null }> = ({
  fingerprint,
  info,
}) => {
  if (!fingerprint && !info) return null;
  const rows = Object.entries(DEVICE_LABELS)
    .filter(([k]) => info && info[k] != null && info[k] !== '')
    .map(([k, label]) => [label, String((info as Record<string, unknown>)[k])] as const);
  return (
    <div className="bg-card border border-border rounded-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <Fingerprint className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Device Fingerprint</h2>
      </div>
      {fingerprint && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground">Fingerprint ID</p>
          <p className="font-mono text-xs text-foreground break-all">{fingerprint}</p>
        </div>
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground truncate" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  clean: { label: 'Clean', cls: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  review: { label: 'Needs Review', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  likely_copy: { label: 'Likely Copy', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
  likely_ai_generated: { label: 'Likely AI-Generated', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const CodeIntegrityCard: React.FC<{ item: CodeIntegrityItem; index: number }> = ({ item, index }) => {
  const a = item.analysis;
  const verdict = VERDICT_STYLE[a?.verdict ?? 'clean'] ?? VERDICT_STYLE.clean;
  const ks = a?.keystroke ?? null;
  return (
    <div className="border border-border rounded-md p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground min-w-0">
          <span className="text-muted-foreground">Q{index + 1}.</span>{' '}
          <span className="line-clamp-2">{item.questionText}</span>
        </p>
        <span className={cn('shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border', verdict.cls)}>
          {verdict.label}
        </span>
      </div>
      {!item.answered || !a ? (
        <p className="text-xs text-muted-foreground mt-2">No submission to analyze.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <p className="text-muted-foreground">Similarity to peers</p>
            <p className={cn('font-mono font-semibold', a.similarity.percent >= 70 ? 'text-destructive' : a.similarity.percent >= 45 ? 'text-amber-500' : 'text-foreground')}>
              {a.similarity.percent}%
              {a.similarity.matchedCandidateName && (
                <span className="ml-1 font-sans font-normal text-muted-foreground">vs {a.similarity.matchedCandidateName}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">AI-generated likelihood</p>
            <p className={cn('font-mono font-semibold', a.ai.score >= 60 ? 'text-destructive' : a.ai.score >= 35 ? 'text-amber-500' : 'text-foreground')}>
              {a.ai.score}%
            </p>
          </div>
          {ks && (
            <div className="col-span-2 text-muted-foreground">
              <span className="font-mono text-foreground">{ks.keystrokes ?? 0}</span> keystrokes ·{' '}
              <span className="font-mono text-foreground">{ks.pastedChars ?? 0}</span> pasted chars ·{' '}
              <span className="font-mono text-foreground">{a.codeLength}</span> code length
            </div>
          )}
          {a.ai.reasons.length > 0 && (
            <ul className="col-span-2 space-y-0.5 mt-0.5">
              {a.ai.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" /> {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const EvidenceClip: React.FC<{ evidence: ApiEvidence; index: number }> = ({ evidence, index }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (url) return;
    setLoading(true);
    try {
      setUrl(await evidenceApi.objectUrl(evidence.id));
    } catch {
      toast.error('Could not load this recording.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-border overflow-hidden bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-foreground">Clip {index + 1}</span>
        <span className="text-[11px] text-muted-foreground">{safeTime(evidence.capturedAt)}</span>
      </div>
      {url ? (
        <video src={url} controls className="w-full aspect-video bg-black" />
      ) : (
        <button
          onClick={load}
          className="w-full aspect-video flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-7 h-7" />}
          <span className="text-xs">{loading ? 'Loading…' : 'Play recording'}</span>
        </button>
      )}
    </div>
  );
};

const SessionReview: React.FC = () => {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { data: breakdown, loading, error, reload } = useAsync(
    () => sessionsApi.riskBreakdown(sessionId),
    [sessionId],
  );
  const { data: alertData, reload: reloadAlerts } = useAsync(() => sessionsApi.alerts(sessionId), [sessionId]);
  const { data: session } = useAsync(() => sessionsApi.get(sessionId), [sessionId]);
  const { data: evidence } = useAsync(() => evidenceApi.list(sessionId), [sessionId]);
  const { data: codeIntegrity } = useAsync(() => sessionsApi.codeIntegrity(sessionId), [sessionId]);

  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const alerts: ApiAlert[] = (alertData ?? []).map((a) =>
    reviewedIds.has(a.id) ? { ...a, reviewed: true } : a,
  );
  const pendingAlerts = alerts.filter((a) => !a.reviewed);

  const resolveAlert = async (id: string, decision: 'accepted' | 'dismissed') => {
    setReviewing(id);
    const resolutionNote = `${decision === 'accepted' ? 'Confirmed violation' : 'Dismissed'}${note ? `: ${note}` : ''}`;
    try {
      await alertsApi.review(id, resolutionNote);
      setReviewedIds((prev) => new Set(prev).add(id));
      setNote('');
      toast.success(decision === 'accepted' ? 'Alert confirmed as a violation' : 'Alert dismissed');
    } catch {
      toast.error('Could not update the alert');
    } finally {
      setReviewing(null);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (error || !breakdown) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mb-3" />
          <p className="text-sm font-medium text-foreground">Couldn't load this session review</p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={reload}>Try again</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>Go back</Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const maxContribution = Math.max(0, ...breakdown.factors.map((f) => f.contribution));
  const overThreshold =
    breakdown.riskThreshold != null && breakdown.riskScore >= breakdown.riskThreshold;

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <Button variant="ghost" size="sm" className="mb-1 -ml-2" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <h1 className="text-xl font-bold text-balance truncate">{breakdown.candidateName}</h1>
            <p className="text-muted-foreground text-sm mt-0.5 truncate">
              {breakdown.assessmentTitle} · {breakdown.status ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RiskBadge level={breakdown.riskLevel} score={breakdown.riskScore} />
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" /> Report
            </Button>
          </div>
        </div>

        {/* AI Explainability Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Risk score gauge */}
          <div className="bg-card border border-border rounded-md p-5 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-3">
              <Brain className="w-4 h-4 text-primary" /> AI Risk Score
            </div>
            <div
              className={cn(
                'text-5xl font-bold font-mono',
                breakdown.riskLevel === 'high'
                  ? 'text-destructive'
                  : breakdown.riskLevel === 'medium'
                    ? 'text-amber-500'
                    : 'text-green-500',
              )}
            >
              {Math.round(breakdown.riskScore)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Integrity {Math.round(breakdown.integrityScore)}%</p>
            {overThreshold && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1">
                <ShieldAlert className="w-3.5 h-3.5" /> Exceeds threshold ({breakdown.riskThreshold}%)
              </div>
            )}
          </div>

          {/* Contribution breakdown */}
          <div className="bg-card border border-border rounded-md p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Risk Score Explainability</h2>
            </div>
            {breakdown.factors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <CheckCircle2 className="w-7 h-7 text-green-500 mb-2" />
                <p className="text-sm font-medium text-foreground">No integrity signals</p>
                <p className="text-xs mt-0.5">This session recorded a clean proctoring profile.</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {breakdown.factors.map((f) => (
                  <FactorRow key={f.type} factor={f} max={maxContribution} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Tab Switches', value: breakdown.tabSwitchCount },
            { label: 'Looking Away', value: breakdown.lookingAwayCount },
            { label: 'Face Not Detected', value: breakdown.faceNotDetectedCount },
            { label: 'Total Signals', value: breakdown.totalEvents },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-md p-4">
              <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Device fingerprint + screen recordings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DeviceInfoPanel fingerprint={session?.deviceFingerprint} info={session?.deviceInfo} />
          <div className="bg-card border border-border rounded-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <MonitorPlay className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Screen Recordings ({(evidence ?? []).filter((e) => e.type === 'video').length})
              </h2>
            </div>
            {(evidence ?? []).filter((e) => e.type === 'video').length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No screen recordings were captured for this session.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[26rem] overflow-y-auto">
                {(evidence ?? [])
                  .filter((e) => e.type === 'video')
                  .map((e, i) => (
                    <EvidenceClip key={e.id} evidence={e} index={i} />
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Code integrity (plagiarism + AI-generated-code) */}
        {(codeIntegrity ?? []).length > 0 && (
          <div className="bg-card border border-border rounded-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileCode2 className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Code Integrity</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {(codeIntegrity ?? []).map((item, i) => (
                <CodeIntegrityCard key={item.questionId} item={item} index={i} />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Review workflow */}
          <div className="bg-card border border-border rounded-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <ListChecks className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Recruiter Review ({pendingAlerts.length} pending)
              </h2>
            </div>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No alerts were raised for this session.</p>
            ) : (
              <div className="space-y-3">
                {pendingAlerts.length > 0 && (
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional review note (applied to your next decision)…"
                    className="text-xs"
                  />
                )}
                {alerts.map((a) => (
                  <div key={a.id} className="border border-border rounded-md p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={a.severity} />
                          <span className="text-xs text-muted-foreground">{safeTime(a.occurredAt)}</span>
                        </div>
                        <p className="text-sm text-foreground mt-1.5">{a.description ?? a.type}</p>
                        {a.resolutionNote && (
                          <p className="text-[11px] text-muted-foreground mt-1 italic">{a.resolutionNote}</p>
                        )}
                      </div>
                    </div>
                    {a.reviewed ? (
                      <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Reviewed
                      </div>
                    ) : (
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={reviewing === a.id}
                          onClick={() => resolveAlert(a.id, 'accepted')}
                        >
                          {reviewing === a.id ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                          )}
                          Confirm Violation
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewing === a.id}
                          onClick={() => resolveAlert(a.id, 'dismissed')}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Dismiss
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Event timeline (session replay) */}
          <div className="bg-card border border-border rounded-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Event Timeline</h2>
            </div>
            {breakdown.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No monitoring events recorded.</p>
            ) : (
              <div className="relative pl-4 max-h-[26rem] overflow-y-auto">
                <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                <div className="space-y-3">
                  {breakdown.timeline.map((e) => (
                    <div key={e.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[9px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-card',
                          SEVERITY_BAR[e.severity ?? 'low'] ?? 'bg-primary',
                        )}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{e.label ?? e.type}</span>
                        <span className="text-xs font-mono text-muted-foreground">+{e.riskDelta.toFixed(0)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {safeTime(e.occurredAt)} · {Math.round(e.confidence * 100)}% confidence
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-center">
          <Link to="/recruiter/alerts" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to all alerts
          </Link>
        </div>
      </div>
    </AppLayout>
  );
};

export default SessionReview;
