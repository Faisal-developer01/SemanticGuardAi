import React from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { StatCard, SeverityBadge } from '@/components/shared/StatusBadges';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentsApi, alertsApi, sessionsApi } from '@/lib/api';
import { mapAssessment, mapAlert } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { BookOpen, AlertTriangle, PlusCircle, Monitor, FileText, ArrowRight, Clock, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { normalizeUtc } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const ALERT_TYPES = ['phone_detected', 'multiple_faces', 'tab_switch', 'looking_away', 'audio_detected'];

function safeDate(value: string, fmt: string): string {
  if (!value) return '—';
  const d = new Date(normalizeUtc(value));
  return Number.isNaN(d.getTime()) ? '—' : format(d, fmt);
}

const RecruiterDashboard: React.FC = () => {
  const { user } = useAuth();
  const { data: assessmentsData } = useAsync(() => assessmentsApi.list({ perPage: 100 }), []);
  const { data: alertsData } = useAsync(() => alertsApi.list({ perPage: 200 }), []);
  const { data: sessionsData } = useAsync(() => sessionsApi.list({ perPage: 200 }), []);

  const myAssessments = (assessmentsData?.items ?? [])
    .filter(a => a.recruiterId === user?.id)
    .map(a => mapAssessment(a));
  const activeAssessment = myAssessments.find(e => e.status === 'active');

  const alerts = (alertsData?.items ?? []).map(mapAlert);
  const unreviewed = alerts.filter(a => !a.reviewed).length;

  const flagged = (sessionsData?.items ?? []).filter(s => s.status === 'flagged').length;

  const alertsByType = ALERT_TYPES.map(t => ({
    name: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    count: alerts.filter(a => a.type === t).length,
  }));

  const recentAlerts = alerts
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl">

        {/* ── Banner ───────────────────────────────────────────────────── */}
        <div className="bg-card rounded-lg border border-border p-5 card-shadow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-primary uppercase tracking-widest bg-primary/8 border border-primary/20 px-2.5 py-1 rounded-full mb-3">
                SemanticGuard AI · Recruiter Portal
              </div>
              <h1 className="text-xl font-bold text-foreground">Recruiter Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">{user?.name ?? 'Recruiter'}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button asChild variant="outline" size="sm" className="rounded-lg h-8 text-xs gap-1.5">
                <Link to="/recruiter/monitoring"><Monitor className="w-3.5 h-3.5" /> Live Monitor</Link>
              </Button>
              <Button asChild size="sm" className="rounded-lg h-8 text-xs gap-1.5">
                <Link to="/recruiter/create-assessment"><PlusCircle className="w-3.5 h-3.5" /> Create Assessment</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="My Assessments" value={myAssessments.length}   subtitle="Total created"   icon={<BookOpen />} />
          <StatCard title="Active Assessment" value={activeAssessment ? 1 : 0} subtitle={activeAssessment?.title ?? 'None active'} icon={<Monitor />} variant={activeAssessment ? 'success' : 'default'} />
          <StatCard title="Flagged"        value={flagged}           subtitle="Need attention"  icon={<AlertTriangle />} variant={flagged > 0 ? 'danger' : 'default'} />
          <StatCard title="Unreviewed"     value={unreviewed}        subtitle="Pending review"  icon={<AlertTriangle />} variant={unreviewed > 0 ? 'warning' : 'default'} />
        </div>

        {/* ── Assessments list + Chart ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* My assessments */}
          <div className="bg-card rounded-lg border border-border p-4 card-shadow flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-foreground">My Assessments</p>
              <Button variant="ghost" size="sm" asChild className="text-primary h-6 text-[11px] px-2">
                <Link to="/recruiter/create-assessment">Manage <ArrowRight className="w-2.5 h-2.5 ml-1" /></Link>
              </Button>
            </div>
            <div className="space-y-2 flex-1">
              {myAssessments.map(assessment => (
                <div key={assessment.id} className="flex items-center gap-2.5 p-2.5 bg-muted/40 hover:bg-accent/50 rounded-lg border border-border transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${assessment.status === 'active' ? 'bg-green-500 ai-active' : assessment.status === 'upcoming' ? 'bg-amber-500' : 'bg-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-foreground truncate">{assessment.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <Clock className="w-2.5 h-2.5 shrink-0" />
                      {safeDate(assessment.startTime, 'MMM d')} · {assessment.duration}m · {assessment.totalCandidates} candidates
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize shrink-0 ${
                    assessment.status === 'active'
                      ? 'border-green-200 text-green-700 bg-green-50 dark:border-green-500/30 dark:text-green-400 dark:bg-green-500/10'
                      : assessment.status === 'upcoming'
                      ? 'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:bg-amber-500/10'
                      : 'border-border text-muted-foreground bg-muted'
                  }`}>
                    {assessment.status}
                  </span>
                  <Link
                    to={`/recruiter/edit-assessment/${assessment.id}`}
                    title="Edit assessment"
                    className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Alert distribution chart */}
          <div className="bg-card rounded-lg border border-border p-4 card-shadow flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-foreground">Alert Distribution</p>
              <Button variant="ghost" size="sm" asChild className="text-primary h-6 text-[11px] px-2">
                <Link to="/recruiter/alerts">View <ArrowRight className="w-2.5 h-2.5 ml-1" /></Link>
              </Button>
            </div>
            <div style={{ minHeight: 160 }}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={alertsByType} layout="vertical" margin={{ right: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11, fontFamily: 'Poppins' }} />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                    {alertsByType.map((_, i) => (
                      <Cell key={i} fill={`hsl(214,64%,${30 + i * 8}%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Alerts table ─────────────────────────────────────────────── */}
        <div className="bg-card rounded-lg border border-border p-4 card-shadow">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-foreground">Recent AI Alerts</p>
              <p className="text-[11px] text-muted-foreground">{unreviewed} pending review</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-primary h-6 text-[11px] px-2">
              <Link to="/recruiter/alerts">All alerts <ArrowRight className="w-2.5 h-2.5 ml-1" /></Link>
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-border">
                  {['Candidate', 'Alert Type', 'Severity', 'Time', 'Status'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-muted-foreground pb-2 pr-4 whitespace-nowrap uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentAlerts.map((a, i) => (
                  <tr key={a.id} className={`border-b border-border/50 last:border-0 ${i % 2 === 1 ? 'bg-muted/20' : ''}`}>
                    <td className="py-2 pr-4 text-[11px] font-semibold text-foreground whitespace-nowrap">{a.candidateName || `Candidate ${a.id.slice(0, 8)}`}</td>
                    <td className="py-2 pr-4 text-[10px] text-muted-foreground whitespace-nowrap capitalize">{a.type.replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-4 whitespace-nowrap"><SeverityBadge severity={a.severity} /></td>
                    <td className="py-2 pr-4 text-[10px] text-muted-foreground whitespace-nowrap font-mono">{safeDate(a.timestamp, 'HH:mm')}</td>
                    <td className="py-2 whitespace-nowrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${a.reviewed ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                        {a.reviewed ? 'Reviewed' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Quick action cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Monitor Live Assessment', icon: Monitor,       to: '/recruiter/monitoring', desc: `${activeAssessment?.totalCandidates ?? 0} candidates active`,   color: 'bg-primary/10 text-primary' },
            { label: 'Review AI Alerts',  icon: AlertTriangle, to: '/recruiter/alerts',     desc: `${unreviewed} pending reviews`,                        color: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
            { label: 'Generate Report',   icon: FileText,      to: '/recruiter/reports',    desc: 'Download assessment reports',                           color: 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400' },
          ].map(({ label, icon: Icon, to, desc, color }) => (
            <Link key={to} to={to}
              className="bg-card rounded-lg border border-border p-3.5 card-shadow card-shadow-hover flex items-center gap-3 group transition-all">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default RecruiterDashboard;
