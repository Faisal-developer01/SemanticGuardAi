import React from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { StatCard, IntegrityScore, RiskBadge } from '@/components/shared/StatusBadges';
import { useAuth } from '@/contexts/AuthContext';
import { authApi, assessmentsApi, sessionsApi } from '@/lib/api';
import { mapAssessment, mapSession } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { BookOpen, Clock, CheckCircle2, TrendingUp, Calendar, Award, ArrowRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

function safeDate(value: string, fmt: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, fmt);
}

const CandidateDashboard: React.FC = () => {
  const { user } = useAuth();
  const { data: me } = useAsync(() => authApi.me(), []);
  const { data: assessmentsData } = useAsync(() => assessmentsApi.list({ perPage: 50 }), []);
  const { data: sessionsData } = useAsync(() => sessionsApi.list({ perPage: 100 }), []);

  const profile = me?.user.candidateProfile ?? null;
  const sessions = (sessionsData?.items ?? []).map(mapSession);
  const completed = sessions.filter(s => s.status === 'completed');

  const totalAssessments = profile?.totalAssessments ?? completed.length;
  const passedAssessments = profile?.passedAssessments ?? completed.filter(s => (s.percentage ?? 0) >= 50).length;
  const integrityScore =
    profile?.integrityScore ??
    (completed.length ? Math.round(completed.reduce((a, s) => a + s.integrityScore, 0) / completed.length) : 100);
  const passRate = totalAssessments ? Math.round((passedAssessments / totalAssessments) * 100) : 0;

  const candidate = { name: user?.name ?? 'Candidate', integrityScore, totalAssessments, passedAssessments };

  const upcoming = (assessmentsData?.items ?? [])
    .map(a => mapAssessment(a))
    .filter(e => e.status === 'upcoming' || e.status === 'active')
    .slice(0, 3);

  const recent = completed
    .slice()
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 4);

  const integrityScoreHistory = completed
    .slice()
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map(s => ({ month: safeDate(s.startTime, 'MMM'), score: s.integrityScore }));

  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl">

        {/* ── Welcome banner (reference style) ─────────────────────────── */}
        <div className="bg-card rounded-lg border border-border p-5 card-shadow">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-primary uppercase tracking-widest bg-primary/8 border border-primary/20 px-2.5 py-1 rounded-full mb-3">
                SemanticGuard AI · Candidate Portal
              </div>
              <h1 className="text-xl font-bold text-foreground text-balance">
                {candidate.name} ✦
              </h1>
              <p className="text-sm text-muted-foreground mt-1 text-pretty max-w-lg">
                Monitor your assessment integrity, access upcoming assessments, and track your performance.
              </p>
            </div>
            <Button asChild size="sm" className="rounded-lg shrink-0 gap-2">
              <Link to="/candidate/assessment">
                <BookOpen className="w-3.5 h-3.5" />
                Browse Assessments
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* ── Stats (4 compact cards like reference) ────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            title="Integrity Score"
            value={candidate.integrityScore}
            subtitle={candidate.integrityScore >= 80 ? 'Excellent standing' : 'Keep it clean'}
            icon={<Award />}
            variant="success"
          />
          <StatCard
            title="Assessments Taken"
            value={candidate.totalAssessments}
            subtitle={`${candidate.passedAssessments} passed`}
            icon={<CheckCircle2 />}
          />
          <StatCard
            title="Pass Rate"
            value={`${passRate}%`}
            subtitle="Assessment performance"
            icon={<TrendingUp />}
            variant="success"
          />
          <StatCard
            title="Upcoming"
            value={upcoming.length}
            subtitle="Scheduled assessments"
            icon={<Calendar />}
            variant={upcoming.length > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* ── Quick actions (reference style) ──────────────────────────── */}
        <div className="bg-card rounded-lg border border-border p-4 card-shadow">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-3">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground inline-block" />
            Quick actions
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button variant="outline" size="sm" asChild className="rounded-lg h-9 text-xs font-medium">
              <Link to="/candidate/profile"><span>Update profile</span></Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="rounded-lg h-9 text-xs font-medium">
              <Link to="/candidate/history"><span>View applications</span></Link>
            </Button>
            <Button size="sm" asChild className="rounded-lg h-9 text-xs font-medium gap-1.5">
              <Link to="/candidate/assessment">
                <BookOpen className="w-3.5 h-3.5" />
                Browse opportunities
              </Link>
            </Button>
          </div>
        </div>

        {/* ── Charts + Upcoming ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Integrity trend */}
          <div className="bg-card rounded-lg border border-border p-4 card-shadow flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-bold text-foreground">Integrity Trend</p>
                <p className="text-[11px] text-muted-foreground">Completed assessments</p>
              </div>
              <IntegrityScore score={candidate.integrityScore} size="sm" />
            </div>
            <div style={{ minHeight: 130 }}>
              {integrityScoreHistory.length === 0 ? (
                <p className="text-[11px] text-muted-foreground py-10 text-center">No completed assessments yet.</p>
              ) : (
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={integrityScoreHistory}>
                  <defs>
                    <linearGradient id="sGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(214,64%,34%)" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="hsl(214,64%,34%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11, fontFamily: 'Poppins' }} />
                  <Line type="monotone" dataKey="score" stroke="hsl(214,64%,34%)" strokeWidth={2} dot={{ fill: 'hsl(214,64%,34%)', r: 3, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Upcoming assessments */}
          <div className="bg-card rounded-lg border border-border p-4 lg:col-span-2 card-shadow flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-bold text-foreground">Upcoming Assessments</p>
                <p className="text-[11px] text-muted-foreground">{upcoming.length} scheduled</p>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-primary hover:text-primary h-7 text-xs px-2">
                <Link to="/candidate/history">View all <ArrowRight className="w-3 h-3 ml-1" /></Link>
              </Button>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-xs py-4 text-center">No upcoming assessments.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map(assessment => (
                  <div key={assessment.id} className="flex items-center gap-3 p-3 bg-muted/40 hover:bg-accent/50 rounded-lg border border-border transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{assessment.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        <span>{safeDate(assessment.startTime, 'MMM d, yyyy · HH:mm')}</span>
                        <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> {assessment.duration}m</span>
                      </div>
                    </div>
                    {assessment.status === 'active' ? (
                      <Button size="sm" asChild className="rounded-md h-7 text-xs shrink-0">
                        <Link to={`/candidate/assessment/${assessment.id}`}>Join</Link>
                      </Button>
                    ) : (
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border capitalize shrink-0">
                        {assessment.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Recent activity (reference: "Recent activity" section) ────── */}
        <div className="bg-card rounded-lg border border-border p-4 card-shadow">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground" /> Recent activity
            </p>
            <Button variant="ghost" size="sm" asChild className="text-primary hover:text-primary h-7 text-xs px-2">
              <Link to="/candidate/history">Full history <ArrowRight className="w-3 h-3 ml-1" /></Link>
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-border">
                  {['Assessment', 'Date', 'Score', 'Integrity', 'Risk'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-muted-foreground pb-2 pr-4 whitespace-nowrap uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((s, i) => (
                  <tr key={s.id} className={`border-b border-border/50 last:border-0 ${i % 2 === 1 ? 'bg-muted/20' : ''}`}>
                    <td className="py-2.5 pr-4 text-xs font-semibold text-foreground whitespace-nowrap max-w-[180px] truncate">{s.assessmentTitle || `Assessment ${s.assessmentId.slice(0, 8)}`}</td>
                    <td className="py-2.5 pr-4 text-[11px] text-muted-foreground whitespace-nowrap">{safeDate(s.startTime, 'MMM d, yyyy')}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-xs text-foreground">{s.percentage ?? 0}%</span>
                      <span className="text-[11px] text-muted-foreground ml-1">({s.score ?? 0}/{s.maxScore})</span>
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <span className={`font-mono font-bold text-xs ${s.integrityScore >= 80 ? 'text-green-600 dark:text-green-400' : s.integrityScore >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        {s.integrityScore}
                      </span>
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      <RiskBadge level={s.riskLevel} score={s.riskScore} />
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

export default CandidateDashboard;
