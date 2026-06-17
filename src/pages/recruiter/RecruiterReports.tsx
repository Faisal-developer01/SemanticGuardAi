import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentsApi, sessionsApi, alertsApi } from '@/lib/api';
import { mapAssessment, mapSession, mapAlert } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FileText, Download, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const TYPE_COLORS = ['#3b82f6', '#f97316', '#ef4444', '#eab308', '#8b5cf6', '#14b8a6', '#ec4899'];

const RecruiterReports: React.FC = () => {
  const { user } = useAuth();
  const [assessmentId, setAssessmentId] = useState('all');

  const { data: assessmentsData } = useAsync(() => assessmentsApi.list({ perPage: 200 }), []);
  const { data: sessionsData } = useAsync(() => sessionsApi.list({ perPage: 500 }), []);
  const { data: alertsData } = useAsync(() => alertsApi.list({ perPage: 500 }), []);

  const myAssessments = (assessmentsData?.items ?? [])
    .filter(a => a.recruiterId === user?.id)
    .map(a => mapAssessment(a));
  const myIds = new Set(myAssessments.map(a => a.id));

  const allSessions = (sessionsData?.items ?? [])
    .map(mapSession)
    .filter(s => myIds.has(s.assessmentId))
    .filter(s => assessmentId === 'all' || s.assessmentId === assessmentId);

  const alerts = (alertsData?.items ?? [])
    .map(mapAlert)
    .filter(a => myIds.has(a.assessmentId))
    .filter(a => assessmentId === 'all' || a.assessmentId === assessmentId);

  // Per-session alert count keyed by candidate+assessment.
  const alertCount = (s: { candidateId: string; assessmentId: string }) =>
    alerts.filter(a => a.candidateId === s.candidateId && a.assessmentId === s.assessmentId).length;

  const sessions = allSessions.filter(s => s.status === 'completed');
  const avgScore = sessions.length ? Math.round(sessions.reduce((a, s) => a + (s.percentage ?? 0), 0) / sessions.length) : 0;
  const avgIntegrity = sessions.length ? Math.round(sessions.reduce((a, s) => a + s.integrityScore, 0) / sessions.length) : 0;
  const totalCandidates = new Set(allSessions.map(s => s.candidateId)).size;
  const titleOf = (id: string) => myAssessments.find(a => a.id === id)?.title ?? `Assessment ${id.slice(0, 8)}`;

  const BUCKETS = [
    { range: '90-100', test: (p: number) => p >= 90 },
    { range: '80-89', test: (p: number) => p >= 80 && p < 90 },
    { range: '70-79', test: (p: number) => p >= 70 && p < 80 },
    { range: '60-69', test: (p: number) => p >= 60 && p < 70 },
    { range: '<60', test: (p: number) => p < 60 },
  ];
  const scoreDistData = BUCKETS.map(b => ({
    range: b.range,
    count: sessions.filter(s => b.test(s.percentage ?? 0)).length,
  }));

  const typeCounts = alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});
  const alertTypeData = Object.entries(typeCounts).map(([type, value], i) => ({
    name: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value,
    color: TYPE_COLORS[i % TYPE_COLORS.length],
  }));

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">Reports</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Generate and download assessment reports</p>
          </div>
          <Button size="sm" onClick={() => toast.success('Report downloaded')}>
            <Download className="w-4 h-4 mr-2" /> Download Report
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-md p-4 flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5 flex-1 min-w-40">
            <Label className="text-xs text-muted-foreground">Select Assessment</Label>
            <select
              value={assessmentId}
              onChange={e => setAssessmentId(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Assessments</option>
              {myAssessments.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 flex-1 min-w-36">
            <Label className="text-xs text-muted-foreground">From Date</Label>
            <input type="date" className="w-full h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" defaultValue="2026-05-01" />
          </div>
          <div className="space-y-1.5 flex-1 min-w-36">
            <Label className="text-xs text-muted-foreground">To Date</Label>
            <input type="date" className="w-full h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" defaultValue="2026-06-01" />
          </div>
          <Button size="sm" variant="outline" onClick={() => toast.success('Report generated')}>
            <BarChart3 className="w-4 h-4 mr-2" /> Generate
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Candidates', value: totalCandidates },
            { label: 'Avg Score', value: `${avgScore}%` },
            { label: 'Avg Integrity', value: avgIntegrity },
            { label: 'Incidents', value: alerts.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-md p-4 h-full">
              <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Score distribution */}
          <div className="bg-card border border-border rounded-md p-4 h-full flex flex-col">
            <h2 className="font-semibold text-sm mb-4">Score Distribution</h2>
            <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scoreDistData}>
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Alert types */}
          <div className="bg-card border border-border rounded-md p-4 h-full flex flex-col">
            <h2 className="font-semibold text-sm mb-4">Alert Types</h2>
            <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={alertTypeData.slice(0, 5)} cx="50%" cy="50%" outerRadius={70} dataKey="value" nameKey="name" label={false}>
                    {alertTypeData.slice(0, 5).map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend layout="horizontal" wrapperStyle={{ paddingTop: 8, fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Session table */}
        <div className="bg-card border border-border rounded-md">
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Assessment Session Details</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Candidate', 'Assessment', 'Score', 'Integrity', 'Risk Score', 'Alerts', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allSessions.slice(0, 8).map(s => (
                  <tr key={s.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{s.candidateName || `Candidate ${s.candidateId.slice(0, 8)}`}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap max-w-[200px] truncate">{titleOf(s.assessmentId)}</td>
                    <td className="px-4 py-3 text-sm font-mono font-bold text-foreground whitespace-nowrap">{s.percentage ?? '—'}%</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-sm font-mono font-bold ${s.integrityScore >= 80 ? 'text-green-500' : s.integrityScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                        {s.integrityScore}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-sm font-mono font-bold ${s.riskScore >= 70 ? 'text-destructive' : s.riskScore >= 40 ? 'text-yellow-500' : 'text-green-500'}`}>
                        {s.riskScore}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{alertCount(s)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded border capitalize ${s.status === 'completed' ? 'border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/10' : 'border-yellow-500/30 text-yellow-600 bg-yellow-500/10'}`}>
                        {s.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default RecruiterReports;
