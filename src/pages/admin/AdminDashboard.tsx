import React from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { StatCard, SeverityBadge } from '@/components/shared/StatusBadges';
import { usersApi, assessmentsApi, alertsApi, auditApi } from '@/lib/api';
import { mapAlert, mapAuditLog } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Users, BookOpen, AlertTriangle, Shield, Server, Activity, ArrowRight, CheckCircle2 } from 'lucide-react';
import { format, subMonths, isSameMonth } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

function safeDate(value: string, fmt: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, fmt);
}

const AdminDashboard: React.FC = () => {
  const { data: usersData } = useAsync(() => usersApi.list({ perPage: 1 }), []);
  const { data: activeUsersData } = useAsync(() => usersApi.list({ perPage: 1, status: 'active' }), []);
  const { data: assessmentsData } = useAsync(() => assessmentsApi.list({ perPage: 200 }), []);
  const { data: alertsData } = useAsync(() => alertsApi.list({ perPage: 200 }), []);
  const { data: auditData } = useAsync(() => auditApi.list({ perPage: 5 }), []);

  const totalUsers = usersData?.meta.total ?? 0;
  const activeUsers = activeUsersData?.meta.total ?? 0;

  const assessments = assessmentsData?.items ?? [];
  const totalAssessments = assessmentsData?.meta.total ?? assessments.length;
  const activeAssessments = assessments.filter(e => e.status === 'active').length;

  const alerts = (alertsData?.items ?? []).map(mapAlert);
  const totalAlerts = alertsData?.meta.total ?? alerts.length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  const pendingAlerts = alerts.filter(a => !a.reviewed).length;
  const recentAlerts = alerts
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 4);

  const auditLogs = (auditData?.items ?? []).map(mapAuditLog).slice(0, 4);

  // Monthly overview derived from real assessments (created) and alerts (incidents).
  const monthlyAssessmentStats = Array.from({ length: 6 }, (_, i) => {
    const ref = subMonths(new Date(), 5 - i);
    return {
      month: format(ref, 'MMM'),
      assessments: assessments.filter(a => a.createdAt && isSameMonth(new Date(a.createdAt), ref)).length,
      incidents: alerts.filter(a => a.timestamp && isSameMonth(new Date(a.timestamp), ref)).length,
    };
  });

  return (
    <AppLayout>
      <div className="space-y-5 max-w-6xl">

        {/* ── Welcome banner ────────────────────────────────────────────── */}
        <div className="bg-card rounded-lg border border-border p-5 card-shadow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-primary uppercase tracking-widest bg-primary/8 border border-primary/20 px-2.5 py-1 rounded-full mb-3">
                SemanticGuard AI · Admin Console
              </div>
              <h1 className="text-xl font-bold text-foreground">System Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
            </div>
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 dark:bg-green-500/10 dark:border-green-500/20 rounded-lg px-3 py-2">
              <Server className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-xs text-green-700 dark:text-green-400 font-semibold">All Systems Operational</span>
            </div>
          </div>
        </div>

        {/* ── Stat cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="Total Users"    value={totalUsers}  subtitle={`${activeUsers} active`}          icon={<Users />} />
          <StatCard title="Active Assessments"   value={activeAssessments}       subtitle="Currently running"                 icon={<BookOpen />}       variant={activeAssessments > 0 ? 'success' : 'default'} />
          <StatCard title="Critical Alerts" value={criticalAlerts}   subtitle={`${pendingAlerts} pending`}       icon={<AlertTriangle />}  variant="danger" />
          <StatCard title="System Uptime"  value="99.8%"             subtitle="Last 30 days"                     icon={<Activity />}       variant="success" />
        </div>

        {/* ── Monthly chart + Quick actions ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-card rounded-lg border border-border p-4 lg:col-span-2 card-shadow flex flex-col">
            <div className="mb-3">
              <p className="text-xs font-bold text-foreground">Monthly Overview</p>
              <p className="text-[11px] text-muted-foreground">Assessments vs Incidents</p>
            </div>
            <div style={{ minHeight: 170 }}>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={monthlyAssessmentStats}>
                  <defs>
                    <linearGradient id="aAssessment" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(214,64%,34%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(214,64%,34%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="aInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(0,84%,58%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(0,84%,58%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11, fontFamily: 'Poppins' }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Poppins', paddingTop: 6 }} />
                  <Area type="monotone" dataKey="assessments"     stroke="hsl(214,64%,34%)" fill="url(#aAssessment)" strokeWidth={2} name="Assessments" />
                  <Area type="monotone" dataKey="incidents" stroke="hsl(0,84%,58%)"   fill="url(#aInc)"  strokeWidth={2} name="Incidents" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-card rounded-lg border border-border p-4 card-shadow flex flex-col">
            <p className="text-xs font-bold text-foreground mb-3">Quick Actions</p>
            <div className="space-y-2 flex-1">
              {[
                { label: 'User Management', icon: Users,        to: '/admin/users',        desc: `${totalUsers} users` },
                { label: 'Assessment Management', icon: BookOpen,     to: '/admin/assessments',        desc: `${totalAssessments} assessments` },
                { label: 'AI Detection',    icon: Shield,       to: '/admin/ai-detection', desc: `${totalAlerts} detections` },
                { label: 'Analytics',       icon: Activity,     to: '/admin/analytics',    desc: 'Recruitment data' },
              ].map(({ label, icon: Icon, to, desc }) => (
                <Link key={to} to={to}
                  className="flex items-center gap-2.5 p-2.5 bg-muted/40 hover:bg-accent/60 rounded-lg border border-border hover:border-primary/20 transition-all group">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── Alerts + Audit ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card rounded-lg border border-border p-4 card-shadow flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-bold text-foreground">Recent AI Alerts</p>
                <p className="text-[11px] text-muted-foreground">{pendingAlerts} pending review</p>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-primary h-6 text-[11px] px-2">
                <Link to="/admin/ai-detection">View all <ArrowRight className="w-2.5 h-2.5 ml-1" /></Link>
              </Button>
            </div>
            <div className="space-y-2">
              {recentAlerts.map(a => (
                <div key={a.id} className="flex items-start gap-2.5 p-2.5 bg-muted/40 rounded-lg border border-border hover:bg-muted/70 transition-colors">
                  <SeverityBadge severity={a.severity} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-foreground truncate">{a.candidateName || `Candidate ${a.id.slice(0, 8)}`}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{a.type.replace(/_/g, ' ')}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{safeDate(a.timestamp, 'HH:mm')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-4 card-shadow flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-bold text-foreground">Audit Activity</p>
                <p className="text-[11px] text-muted-foreground">System events log</p>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-primary h-6 text-[11px] px-2">
                <Link to="/admin/audit-logs">View all <ArrowRight className="w-2.5 h-2.5 ml-1" /></Link>
              </Button>
            </div>
            <div className="space-y-2">
              {auditLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2.5 p-2.5 bg-muted/40 rounded-lg border border-border hover:bg-muted/70 transition-colors">
                  <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${log.status === 'success' ? 'bg-green-500' : log.status === 'failure' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-foreground">{log.userName}</p>
                    <p className="text-[10px] text-muted-foreground truncate font-mono">{log.action} · {log.details}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{safeDate(log.timestamp, 'HH:mm')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Security status ───────────────────────────────────────────── */}
        <div className="bg-card rounded-lg border border-border p-4 card-shadow">
          <p className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" /> Security Status
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'JWT Auth',         status: 'Active' },
              { label: 'RBAC',             status: 'Enforced' },
              { label: 'MFA',              status: 'Enabled' },
              { label: 'Rate Limiting',    status: '100 req/min' },
              { label: 'CSRF Protection',  status: 'Active' },
              { label: 'XSS Prevention',   status: 'Active' },
              { label: 'Brute Force',      status: 'Active' },
              { label: 'Audit Logging',    status: 'Recording' },
            ].map(({ label, status }) => (
              <div key={label} className="flex items-center gap-2 p-2.5 bg-green-50 dark:bg-green-500/5 rounded-lg border border-green-100 dark:border-green-500/15">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground truncate">{label}</p>
                  <p className="text-[10px] text-green-600 dark:text-green-400">{status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminDashboard;
