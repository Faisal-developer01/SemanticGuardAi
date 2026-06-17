import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { SeverityBadge } from '@/components/shared/StatusBadges';
import { alertsApi } from '@/lib/api';
import { mapAlert } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Shield, Search, Download } from 'lucide-react';
import { format, subDays, isSameDay } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

const TYPE_COLORS = ['#3b82f6', '#f97316', '#ef4444', '#eab308', '#8b5cf6', '#14b8a6', '#ec4899'];

function safeDate(value: string, fmt: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, fmt);
}

const AIDetectionDashboard: React.FC = () => {
  const [search, setSearch] = useState('');
  const { data: alertsData } = useAsync(() => alertsApi.list({ perPage: 500 }), []);
  const alerts = (alertsData?.items ?? []).map(mapAlert);

  const filtered = alerts.filter(a =>
    search === '' || a.candidateName.toLowerCase().includes(search.toLowerCase()) ||
    a.type.toLowerCase().includes(search.toLowerCase())
  );

  const totalAlerts = alertsData?.meta.total ?? alerts.length;
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const pendingCount = alerts.filter(a => !a.reviewed).length;
  const avgRisk = alerts.length ? Math.round(alerts.reduce((a, x) => a + x.riskScore, 0) / alerts.length) : 0;

  const aiDetectionStats = [
    { label: 'Total Detections', value: `${totalAlerts}` },
    { label: 'Critical Alerts', value: `${criticalCount}` },
    { label: 'Pending Review', value: `${pendingCount}` },
    { label: 'Avg Risk Score', value: `${avgRisk}` },
  ];

  const typeCounts = alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});
  const alertTypeData = Object.entries(typeCounts).map(([type, value], i) => ({
    name: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value,
    color: TYPE_COLORS[i % TYPE_COLORS.length],
  }));

  const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
    const ref = subDays(new Date(), 6 - i);
    const dayAlerts = alerts.filter(a => a.timestamp && isSameDay(new Date(a.timestamp), ref));
    return {
      day: format(ref, 'EEE'),
      alerts: dayAlerts.length,
      critical: dayAlerts.filter(a => a.severity === 'critical').length,
    };
  });

  return (
    <AppLayout>
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">AI Detection Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Comprehensive AI monitoring analytics</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => toast.success('Detection data exported')}>
            <Download className="w-4 h-4 mr-2" /> Export Data
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {aiDetectionStats.map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-md p-4 h-full">
              <p className="text-2xl font-bold font-mono text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Weekly trend */}
          <div className="lg:col-span-2 bg-card border border-border rounded-md p-4 h-full flex flex-col">
            <h2 className="font-semibold text-sm mb-4">Detection Trend (7 Days)</h2>
            <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weeklyTrend}>
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }} />
                  <Line type="monotone" dataKey="alerts" stroke="hsl(var(--primary))" strokeWidth={2} name="Total Alerts" dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="critical" stroke="hsl(var(--destructive))" strokeWidth={2} name="Critical" dot={{ r: 3 }} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detection types pie */}
          <div className="bg-card border border-border rounded-md p-4 h-full flex flex-col">
            <h2 className="font-semibold text-sm mb-4">Detection Types</h2>
            <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={alertTypeData} cx="50%" cy="50%" outerRadius={60} dataKey="value" nameKey="name" label={false}>
                    {alertTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Legend layout="horizontal" wrapperStyle={{ paddingTop: 8, fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Detection type bar */}
        <div className="bg-card border border-border rounded-md p-4">
          <h2 className="font-semibold text-sm mb-4">Alert Volume by Type</h2>
          <div style={{ minHeight: 120 }}>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={alertTypeData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={130} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {alertTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* All detections table */}
        <div className="bg-card border border-border rounded-md">
          <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <h2 className="font-semibold text-sm">All AI Detections</h2>
            <div className="relative flex-1 min-w-40 ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-9 h-8" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Timestamp', 'Candidate', 'Assessment', 'Detection Type', 'Severity', 'Risk Score', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">{safeDate(a.timestamp, 'MMM d, HH:mm:ss')}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{a.candidateName || `Candidate ${a.candidateId.slice(0, 8)}`}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap max-w-[160px] truncate">{a.assessmentTitle || `Assessment ${a.assessmentId.slice(0, 8)}`}</td>
                    <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap capitalize">{a.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><SeverityBadge severity={a.severity} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-mono font-bold text-sm ${a.riskScore >= 70 ? 'text-destructive' : a.riskScore >= 40 ? 'text-yellow-500' : 'text-green-500'}`}>
                        {a.riskScore}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs ${a.reviewed ? 'text-green-500' : 'text-yellow-500'}`}>
                        {a.reviewed ? 'Reviewed' : 'Pending'}
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

export default AIDetectionDashboard;
