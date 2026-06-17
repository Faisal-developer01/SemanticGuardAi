import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { RiskBadge } from '@/components/shared/StatusBadges';
import { sessionsApi } from '@/lib/api';
import { mapSession } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight, Search, Calendar, BookOpen, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { AssessmentSession } from '@/types/types';

function safeDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'MMM d, yyyy');
}
function avg(list: number[]): number {
  return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
}

const AssessmentHistory: React.FC = () => {
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useAsync(() => sessionsApi.list({ perPage: 200 }), []);

  const history: AssessmentSession[] = (data?.items ?? [])
    .map(mapSession)
    .filter(s => s.status === 'completed');

  const filtered = history.filter(s =>
    s.assessmentTitle.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">Assessment History</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{filtered.length} assessments completed</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assessments…" className="pl-9" />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Assessments', value: history.length },
            { label: 'Avg Score', value: `${avg(history.map(s => s.percentage ?? 0))}%` },
            { label: 'Avg Integrity', value: `${avg(history.map(s => s.integrityScore))}` },
            { label: 'Clean Records', value: history.filter(s => s.alerts.length === 0).length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-md p-4 h-full">
              <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Assessment', 'Date', 'Duration', 'Score', 'Integrity', 'Risk', 'Alerts', ''].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin inline mr-2 text-primary" /> Loading history…</td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm"><AlertCircle className="w-5 h-5 inline mr-2 text-destructive" /> {error}<Button size="sm" variant="outline" className="ml-3" onClick={reload}>Retry</Button></td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No assessments found</td>
                  </tr>
                ) : (
                  filtered.map(session => (
                    <tr key={session.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-foreground max-w-xs truncate">{session.assessmentTitle || `Assessment ${session.assessmentId.slice(0, 8)}`}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {safeDate(session.startTime)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">45m</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-sm text-foreground">{session.percentage ?? 0}%</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`font-mono font-bold text-sm ${session.integrityScore >= 80 ? 'text-green-500' : session.integrityScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {session.integrityScore}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <RiskBadge level={session.riskLevel} score={session.riskScore} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {session.alerts.length === 0 ? (
                          <span className="text-green-500">None</span>
                        ) : (
                          <span className="text-destructive">{session.alerts.length}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/candidate/results/${session.id}`}>
                            Details <ChevronRight className="w-3 h-3 ml-1" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AssessmentHistory;
