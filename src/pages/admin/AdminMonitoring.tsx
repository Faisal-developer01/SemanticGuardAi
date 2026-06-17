import React from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { StatCard, StatusDot } from '@/components/shared/StatusBadges';
import { sessionsApi, type ApiLiveSession } from '@/lib/api';
import { useAsync } from '@/lib/useApi';
import { mapLiveSession } from '@/lib/mappers';
import { useMonitoringFeed } from '@/lib/realtime';
import { Monitor, AlertTriangle, Users, Gauge, Activity } from 'lucide-react';

const EMPTY: ApiLiveSession[] = [];

const AdminMonitoring: React.FC = () => {
  const { data: initial } = useAsync(() => sessionsApi.live(), []);
  const { sessions, connected } = useMonitoringFeed(initial ?? EMPTY);
  const candidates = sessions.map(mapLiveSession);

  const flagged = candidates.filter(s => s.isFlagged);
  const totalAlerts = candidates.reduce((sum, s) => sum + s.alertCount, 0);
  const avgRisk = candidates.length
    ? Math.round(candidates.reduce((sum, s) => sum + s.status.riskScore, 0) / candidates.length)
    : 0;
  const riskBuckets = {
    low: candidates.filter(s => s.status.riskLevel === 'low').length,
    medium: candidates.filter(s => s.status.riskLevel === 'medium').length,
    high: candidates.filter(s => s.status.riskLevel === 'high').length,
  };

  return (
    <AppLayout>
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">System Monitoring</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Real-time proctoring activity across the platform</p>
          </div>
          <div className={`flex items-center gap-1.5 rounded px-2 py-1 border ${connected ? 'bg-green-500/10 border-green-500/20' : 'bg-muted border-border'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 ai-active' : 'bg-muted-foreground'}`} />
            <span className={`text-xs font-medium ${connected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {connected ? 'Live feed connected' : 'Connecting…'}
            </span>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Active Sessions" value={candidates.length} subtitle="Currently proctored" icon={<Users className="w-5 h-5" />} variant={candidates.length > 0 ? 'success' : 'default'} />
          <StatCard title="Flagged Sessions" value={flagged.length} subtitle="Require attention" icon={<AlertTriangle className="w-5 h-5" />} variant={flagged.length > 0 ? 'danger' : 'default'} />
          <StatCard title="Total Alerts" value={totalAlerts} subtitle="Across active sessions" icon={<Activity className="w-5 h-5" />} variant={totalAlerts > 0 ? 'danger' : 'default'} />
          <StatCard title="Avg Risk Score" value={avgRisk} subtitle="Live average" icon={<Gauge className="w-5 h-5" />} variant={avgRisk >= 70 ? 'danger' : avgRisk >= 40 ? 'default' : 'success'} />
        </div>

        {/* Risk distribution */}
        <div className="bg-card border border-border rounded-md p-5">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Risk Distribution</h2>
            <span className="ml-auto text-xs text-muted-foreground">{candidates.length} session{candidates.length !== 1 ? 's' : ''}</span>
          </div>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No active sessions to analyze.</p>
          ) : (
            <div className="space-y-3">
              {([
                { label: 'Low Risk', count: riskBuckets.low, color: 'bg-green-500' },
                { label: 'Medium Risk', count: riskBuckets.medium, color: 'bg-yellow-500' },
                { label: 'High Risk', count: riskBuckets.high, color: 'bg-destructive' },
              ] as const).map(({ label, count, color }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs font-mono font-medium text-foreground">{count}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${candidates.length ? (count / candidates.length) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live candidate connections */}
        <div className="bg-card border border-border rounded-md p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" /> Live Candidate Connections
          </h2>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No candidates are currently connected.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="border-b border-border">
                    {['Candidate', 'Assessment', 'Face', 'Phone', 'Gaze', 'Risk', 'Alerts'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map(s => (
                    <tr key={s.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-4 text-sm font-medium text-foreground whitespace-nowrap">{s.name}</td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">{s.assessmentTitle}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap"><StatusDot active={s.status.faceDetected} label={s.status.faceDetected ? 'OK' : 'Missing'} /></td>
                      <td className="py-2.5 pr-4 whitespace-nowrap"><StatusDot active={!s.status.phoneDetected} label={s.status.phoneDetected ? 'Detected' : 'Clear'} /></td>
                      <td className="py-2.5 pr-4 text-xs whitespace-nowrap">
                        <span className={s.status.eyeGaze === 'screen' ? 'text-green-500' : 'text-yellow-500'}>
                          {s.status.eyeGaze}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <span className={`font-mono font-bold text-sm ${s.status.riskScore >= 70 ? 'text-destructive' : s.status.riskScore >= 40 ? 'text-yellow-500' : 'text-green-500'}`}>
                          {s.status.riskScore}
                        </span>
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span className={s.alertCount > 0 ? 'text-destructive text-xs font-medium' : 'text-green-500 text-xs'}>
                          {s.alertCount > 0 ? `${s.alertCount} alerts` : 'None'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminMonitoring;
