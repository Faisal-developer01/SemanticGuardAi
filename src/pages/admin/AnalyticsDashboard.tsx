import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { assessmentsApi, alertsApi, sessionsApi } from '@/lib/api';
import { mapSession } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { format, subMonths, isSameMonth } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell
} from 'recharts';
import { generateAnalyticsReport, type AnalyticsReportData } from '@/lib/reportPdf';

const RISK_COLORS: Record<string, string> = { 'Low Risk': '#22c55e', 'Medium Risk': '#eab308', 'High Risk': '#f97316' };

const AnalyticsDashboard: React.FC = () => {
  const { data: assessmentsData } = useAsync(() => assessmentsApi.list({ perPage: 500 }), []);
  const { data: alertsData } = useAsync(() => alertsApi.list({ perPage: 500 }), []);
  const { data: sessionsData } = useAsync(() => sessionsApi.list({ perPage: 500 }), []);

  const assessments = assessmentsData?.items ?? [];
  const totalAssessments = assessmentsData?.meta.total ?? assessments.length;
  const apiAlerts = alertsData?.items ?? [];
  const totalAlerts = alertsData?.meta.total ?? apiAlerts.length;
  const sessions = (sessionsData?.items ?? []).map(mapSession);
  const completed = sessions.filter(s => s.status === 'completed');

  const avgIntegrity = completed.length
    ? Math.round((completed.reduce((a, s) => a + s.integrityScore, 0) / completed.length) * 10) / 10
    : 0;
  const flaggedSessions = (sessionsData?.items ?? []).filter(s => s.status === 'flagged').length;

  const months = Array.from({ length: 6 }, (_, i) => subMonths(new Date(), 5 - i));

  const monthlyAssessmentStats = months.map(ref => {
    const monthSessions = sessions.filter(s => s.startTime && isSameMonth(new Date(s.startTime), ref));
    return {
      month: format(ref, 'MMM'),
      assessments: assessments.filter(a => a.createdAt && isSameMonth(new Date(a.createdAt), ref)).length,
      incidents: apiAlerts.filter(a => a.occurredAt && isSameMonth(new Date(a.occurredAt), ref)).length,
      alerts: apiAlerts.filter(a => a.occurredAt && isSameMonth(new Date(a.occurredAt), ref)).length,
      candidates: monthSessions.length,
    };
  });

  const performanceTrend = months.map(ref => {
    const monthCompleted = completed.filter(s => s.startTime && isSameMonth(new Date(s.startTime), ref));
    const avg = (sel: (s: typeof monthCompleted[number]) => number) =>
      monthCompleted.length ? Math.round(monthCompleted.reduce((a, s) => a + sel(s), 0) / monthCompleted.length) : 0;
    return {
      month: format(ref, 'MMM'),
      avgScore: avg(s => s.percentage ?? 0),
      avgIntegrity: avg(s => s.integrityScore),
      candidates: monthCompleted.length,
    };
  });

  const riskDistribution = (['low', 'medium', 'high'] as const).map(level => ({
    name: level === 'low' ? 'Low Risk' : level === 'medium' ? 'Medium Risk' : 'High Risk',
    value: completed.filter(s => s.riskLevel === level).length,
    color: RISK_COLORS[level === 'low' ? 'Low Risk' : level === 'medium' ? 'Medium Risk' : 'High Risk'],
  })).filter(d => d.value > 0);

  const [downloading, setDownloading] = useState(false);
  const handleExport = async () => {
    setDownloading(true);
    try {
      const data: AnalyticsReportData = {
        kpis: [
          { label: 'Total Assessments Conducted', value: `${totalAssessments}` },
          { label: 'Avg Integrity Score', value: `${avgIntegrity}` },
          { label: 'Integrity Incidents', value: `${totalAlerts}` },
          { label: 'Flagged Sessions', value: `${flaggedSessions}` },
        ],
        monthly: monthlyAssessmentStats.map(m => ({
          month: m.month, assessments: m.assessments, incidents: m.incidents, candidates: m.candidates,
        })),
        riskDistribution: riskDistribution.map(r => ({ name: r.name, value: r.value })),
        performance: performanceTrend.map(p => ({
          month: p.month, avgScore: p.avgScore, avgIntegrity: p.avgIntegrity,
        })),
      };
      const stamp = format(new Date(), 'yyyyMMdd-HHmm');
      await generateAnalyticsReport(data, `SemanticGuard-Analytics-Report-${stamp}.pdf`);
      toast.success('Analytics report downloaded.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate the analytics report.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">Analytics Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Organization-wide recruitment integrity analytics</p>
          </div>
          <Button size="sm" onClick={handleExport} disabled={downloading}>
            {downloading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing…</>
              : <><Download className="w-4 h-4 mr-2" /> Export Report</>}
          </Button>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Assessments Conducted', value: `${totalAssessments}` },
            { label: 'Avg Integrity Score', value: `${avgIntegrity}` },
            { label: 'Integrity Incidents', value: `${totalAlerts}` },
            { label: 'Flagged Sessions', value: `${flaggedSessions}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-md p-4 h-full">
              <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Monthly assessments & incidents */}
        <div className="bg-card border border-border rounded-md p-4">
          <h2 className="font-semibold text-sm mb-4">Monthly Assessments &amp; Incidents</h2>
          <div style={{ minHeight: 220 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyAssessmentStats}>
                <defs>
                  <linearGradient id="assessmentBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="assessments" fill="hsl(var(--primary))" name="Assessments" radius={[2, 2, 0, 0]} />
                <Bar dataKey="incidents" fill="hsl(var(--destructive))" name="Incidents" radius={[2, 2, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance trend */}
          <div className="bg-card border border-border rounded-md p-4 h-full flex flex-col">
            <h2 className="font-semibold text-sm mb-4">Candidate Performance Trends</h2>
            <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={performanceTrend}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="integrityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[60, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="avgScore" stroke="hsl(var(--primary))" fill="url(#scoreGrad)" strokeWidth={2} name="Avg Score" />
                  <Area type="monotone" dataKey="avgIntegrity" stroke="#22c55e" fill="url(#integrityGrad)" strokeWidth={2} name="Avg Integrity" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Risk distribution */}
          <div className="bg-card border border-border rounded-md p-4 h-full flex flex-col">
            <h2 className="font-semibold text-sm mb-4">Candidate Risk Distribution</h2>
            <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={riskDistribution} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {riskDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Alert frequency */}
        <div className="bg-card border border-border rounded-md p-4">
          <h2 className="font-semibold text-sm mb-4">Alert Frequency Analysis</h2>
          <div style={{ minHeight: 140 }}>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={monthlyAssessmentStats}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line type="monotone" dataKey="alerts" stroke="hsl(var(--destructive))" strokeWidth={2} name="Alerts" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="candidates" stroke="hsl(var(--primary))" strokeWidth={2} name="Candidates" dot={{ r: 3 }} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AnalyticsDashboard;
