import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { auditApi } from '@/lib/api';
import { mapAuditLog } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, Download, FileText, Filter, Loader2, AlertCircle } from 'lucide-react';
import type { AuditLog } from '@/types/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { generateAuditReport, type AuditReportRow } from '@/lib/reportPdf';

const ACTION_COLORS: Record<string, string> = {
  login: 'text-blue-500',
  logout: 'text-muted-foreground',
  assessment_start: 'text-green-500',
  assessment_submit: 'text-primary',
  alert_created: 'text-orange-500',
  user_suspended: 'text-destructive',
  settings_changed: 'text-yellow-500',
  role_changed: 'text-purple-500',
};

function safeDate(value: string, fmt: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, fmt);
}

const AuditLogs: React.FC = () => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');

  const { data, loading, error, reload } = useAsync(() => auditApi.list({ perPage: 200 }), []);
  const logs: AuditLog[] = (data?.items ?? []).map(mapAuditLog);

  const actions = ['all', ...Array.from(new Set(logs.map(l => l.action)))];
  const filtered: AuditLog[] = logs.filter(l =>
    (actionFilter === 'all' || l.action === actionFilter) &&
    (statusFilter === 'all' || l.status === statusFilter) &&
    (search === '' ||
      l.userName.toLowerCase().includes(search.toLowerCase()) ||
      l.action.includes(search.toLowerCase()) ||
      l.details.toLowerCase().includes(search.toLowerCase()))
  );

  const exportLogs = () => {
    const header = 'timestamp,user,role,action,resource,ip,status,details\n';
    const rows = filtered
      .map(l => [l.timestamp, l.userName, l.userRole, l.action, l.resource, l.ipAddress, l.status, JSON.stringify(l.details)].join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported audit logs');
  };

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const downloadPdf = async () => {
    if (filtered.length === 0) {
      toast.error('No audit records to export.');
      return;
    }
    setDownloadingPdf(true);
    try {
      const rows: AuditReportRow[] = filtered.map(l => ({
        timestamp: safeDate(l.timestamp, 'dd MMM yyyy, HH:mm:ss'),
        user: l.userName || 'System',
        role: l.userRole,
        action: l.action,
        resource: l.resource,
        ipAddress: l.ipAddress,
        status: l.status,
        details: typeof l.details === 'string' ? l.details : JSON.stringify(l.details),
      }));
      const meta = {
        total: filtered.length,
        success: filtered.filter(l => l.status === 'success').length,
        failure: filtered.filter(l => l.status === 'failure').length,
        warning: filtered.filter(l => l.status === 'warning').length,
      };
      const stamp = format(new Date(), 'yyyyMMdd-HHmm');
      await generateAuditReport(rows, meta, `SemanticGuard-Audit-Report-${stamp}.pdf`);
      toast.success('Audit report downloaded.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate the audit report.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">Audit Logs</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{filtered.length} records · Immutable audit trail</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportLogs}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button size="sm" onClick={downloadPdf} disabled={downloadingPdf}>
              {downloadingPdf
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing…</>
                : <><FileText className="w-4 h-4 mr-2" /> Download Report</>}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user, action, details…" className="pl-9" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              aria-label="Filter by action"
              className="h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {actions.map(a => <option key={a} value={a}>{a === 'all' ? 'All Actions' : a.replace(/_/g, ' ')}</option>)}
            </select>
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['all', 'success', 'failure'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn('px-3 py-1.5 text-xs transition-colors capitalize', statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                >{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Counts */}
        <div className="flex gap-4 flex-wrap">
          {[
            { label: 'Total', value: logs.length },
            { label: 'Success', value: logs.filter(l => l.status === 'success').length },
            { label: 'Failures', value: logs.filter(l => l.status === 'failure').length },
            { label: 'Today', value: logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded px-4 py-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Timestamp', 'User', 'Role', 'Action', 'Details', 'IP Address', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin inline mr-2 text-primary" /> Loading logs…</td></tr>
                ) : error ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm"><AlertCircle className="w-5 h-5 inline mr-2 text-destructive" /> {error}<Button size="sm" variant="outline" className="ml-3" onClick={reload}>Retry</Button></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No logs found</td></tr>
                ) : (
                  filtered.map(log => (
                    <tr key={log.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{safeDate(log.timestamp, 'MMM d, HH:mm:ss')}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm font-medium text-foreground">{log.userName}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs capitalize text-muted-foreground">{log.userRole}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn('text-xs font-mono font-medium', ACTION_COLORS[log.action] ?? 'text-foreground')}>
                          {log.action.replace(/_/g, '_')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap max-w-[240px] truncate">{log.details}</td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{log.ipAddress}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn('text-xs px-2 py-0.5 rounded border capitalize', {
                          success: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
                          failure: 'bg-red-500/10 text-red-600 border-red-500/30',
                          warning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
                        }[log.status])}>
                          {log.status}
                        </span>
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

export default AuditLogs;
