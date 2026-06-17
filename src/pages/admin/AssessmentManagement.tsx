import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { assessmentsApi } from '@/lib/api';
import { mapAssessment } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, Edit2, Trash2, Eye, Loader2, AlertCircle } from 'lucide-react';
import type { Assessment, AssessmentStatus } from '@/types/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<AssessmentStatus, string> = {
  active: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
  upcoming: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
  cancelled: 'bg-red-500/10 text-red-600 border-red-500/30',
};

function safeDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'MMM d, yyyy');
}

const AssessmentManagement: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AssessmentStatus | 'all'>('all');

  const { data, loading, error, reload } = useAsync(() => assessmentsApi.list({ perPage: 200 }), []);
  const assessments: Assessment[] = (data?.items ?? []).map(a => mapAssessment(a));

  const filtered = assessments.filter(e =>
    (statusFilter === 'all' || e.status === statusFilter) &&
    (search === '' || e.title.toLowerCase().includes(search.toLowerCase()) || e.recruiterName.toLowerCase().includes(search.toLowerCase()))
  );

  const remove = async (a: Assessment) => {
    try {
      await assessmentsApi.remove(a.id);
      toast.success(`Deleted ${a.title}`);
      reload();
    } catch {
      toast.error('Could not delete assessment');
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">Assessment Management</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{filtered.length} of {assessments.length} assessments</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assessments or recruiter…" className="pl-9" />
          </div>
          <div className="flex rounded-md border border-border overflow-hidden shrink-0">
            {(['all', 'active', 'upcoming', 'completed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn('px-3 py-1.5 text-xs transition-colors capitalize', statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 flex-wrap">
          {(['active', 'upcoming', 'completed'] as AssessmentStatus[]).map(s => (
            <div key={s} className="bg-card border border-border rounded px-4 py-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">{assessments.filter(e => e.status === s).length}</p>
              <p className="text-xs text-muted-foreground capitalize">{s}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Assessment', 'Recruiter', 'Date', 'Duration', 'Candidates', 'AI Monitoring', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin inline mr-2 text-primary" /> Loading assessments…</td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm"><AlertCircle className="w-5 h-5 inline mr-2 text-destructive" /> {error}<Button size="sm" variant="outline" className="ml-3" onClick={reload}>Retry</Button></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No assessments found</td></tr>
                ) : (
                  filtered.map(assessment => {
                    const aiCount = Object.values(assessment.aiMonitoring).filter(Boolean).length;
                    return (
                      <tr key={assessment.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-sm font-medium text-foreground max-w-[200px] truncate">{assessment.title}</p>
                          <p className="text-xs text-muted-foreground">{assessment.position}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap max-w-[140px] truncate">{assessment.recruiterName || '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{safeDate(assessment.startTime)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{assessment.duration}m</td>
                        <td className="px-4 py-3 text-sm font-mono font-bold text-foreground whitespace-nowrap">{assessment.totalCandidates}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono">{aiCount}/6</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded border capitalize ${STATUS_STYLES[assessment.status]}`}>{assessment.status}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => toast.info(`Viewing ${assessment.title}`)}><Eye className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => toast.info(`Editing ${assessment.title}`)}><Edit2 className="w-3.5 h-3.5" /></Button>
                            {assessment.status !== 'active' && (
                              <Button size="sm" variant="ghost" onClick={() => remove(assessment)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AssessmentManagement;
