import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { SeverityBadge } from '@/components/shared/StatusBadges';
import { alertsApi } from '@/lib/api';
import { mapAlert } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { AlertTriangle, Search, CheckCircle2, Filter, Loader2, Brain } from 'lucide-react';
import type { AIAlert, AlertSeverity } from '@/types/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const ALERT_LABELS: Record<string, string> = {
  multiple_faces: 'Multiple Faces Detected',
  phone_detected: 'Phone Detected',
  looking_away: 'Looking Away',
  tab_switch: 'Tab Switch',
  suspicious_movement: 'Suspicious Movement',
  audio_detected: 'Audio Detected',
  face_not_detected: 'Face Not Detected',
  identity_mismatch: 'Identity Mismatch',
  browser_unfocused: 'Browser Unfocused',
  object_detected: 'Object Detected',
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function candidateLabel(a: AIAlert): string {
  return a.candidateName || `Candidate ${a.candidateId.slice(0, 8)}`;
}
function safeDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'MMM d, HH:mm:ss');
}

const AIAlertPanel: React.FC = () => {
  const { data, loading, error, reload } = useAsync(() => alertsApi.list({ perPage: 200 }), []);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | 'all'>('all');
  const [filterReviewed, setFilterReviewed] = useState<'all' | 'pending' | 'reviewed'>('all');

  const alerts: AIAlert[] = (data?.items ?? [])
    .map(mapAlert)
    .map(a => (reviewedIds.has(a.id) ? { ...a, reviewed: true } : a));

  const filtered = alerts
    .filter(a =>
      (filterSeverity === 'all' || a.severity === filterSeverity) &&
      (filterReviewed === 'all' || (filterReviewed === 'pending' ? !a.reviewed : a.reviewed)) &&
      (search === '' || candidateLabel(a).toLowerCase().includes(search.toLowerCase()) || ALERT_LABELS[a.type]?.toLowerCase().includes(search.toLowerCase()))
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

  const pending = alerts.filter(a => !a.reviewed).length;

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">AI Alert Panel</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {pending} pending · {alerts.length - pending} reviewed
            </p>
          </div>
          {pending > 0 && (
            <Button size="sm" variant="outline" onClick={markAllReviewed}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> Mark All Reviewed
            </Button>
          )}
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          {(['critical', 'high', 'medium', 'low'] as AlertSeverity[]).map(sev => {
            const count = alerts.filter(a => a.severity === sev).length;
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(f => f === sev ? 'all' : sev)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors',
                  filterSeverity === sev ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:bg-muted'
                )}
              >
                <span className={cn('w-2 h-2 rounded-full', { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-green-500' }[sev])} />
                {sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by candidate or alert type…" className="pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['all', 'pending', 'reviewed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterReviewed(f)}
                  className={cn('px-3 py-1.5 text-xs transition-colors capitalize', filterReviewed === f ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Alert list */}
        <div className="space-y-2">
          {loading ? (
            <div className="bg-card border border-border rounded-md p-8 text-center">
              <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
              <p className="text-muted-foreground text-sm">Loading alerts…</p>
            </div>
          ) : error ? (
            <div className="bg-card border border-destructive/30 rounded-md p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
              <p className="text-foreground text-sm">{error}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={reload}>Retry</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="text-foreground font-medium">No alerts match your filter</p>
              <p className="text-muted-foreground text-sm mt-1">All clear!</p>
            </div>
          ) : (
            filtered.map(alert => (
              <div
                key={alert.id}
                className={cn(
                  'bg-card border rounded-md p-4 flex items-start gap-4 transition-opacity',
                  alert.severity === 'critical' ? 'border-red-500/30' : alert.severity === 'high' ? 'border-orange-500/20' : 'border-border',
                  alert.reviewed && 'opacity-60'
                )}
              >
                <div className={cn('w-9 h-9 rounded-md flex items-center justify-center shrink-0', {
                  critical: 'bg-red-500/10', high: 'bg-orange-500/10', medium: 'bg-yellow-500/10', low: 'bg-green-500/10'
                }[alert.severity])}>
                  <AlertTriangle className={cn('w-4 h-4', {
                    critical: 'text-red-500', high: 'text-orange-500', medium: 'text-yellow-500', low: 'text-green-500'
                  }[alert.severity])} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-foreground">{ALERT_LABELS[alert.type] ?? alert.type}</p>
                    <SeverityBadge severity={alert.severity} />
                    {alert.reviewed && (
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Reviewed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-pretty">{alert.description}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{candidateLabel(alert)}</span>
                    <span className="truncate max-w-[200px]">{alert.assessmentTitle.split('–')[0].trim()}</span>
                    <span>{safeDate(alert.timestamp)}</span>
                    <span className={cn('font-mono font-bold', alert.riskScore >= 70 ? 'text-destructive' : alert.riskScore >= 40 ? 'text-yellow-500' : 'text-green-500')}>
                      Risk: {alert.riskScore}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button size="sm" variant="secondary" asChild className="shrink-0">
                    <Link to={`/recruiter/review/${alert.sessionId}`}>
                      <Brain className="w-3.5 h-3.5 mr-1.5" /> Review Session
                    </Link>
                  </Button>
                  {!alert.reviewed && (
                    <Button size="sm" variant="outline" onClick={() => markReviewed(alert.id)} className="shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Mark Reviewed
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default AIAlertPanel;
