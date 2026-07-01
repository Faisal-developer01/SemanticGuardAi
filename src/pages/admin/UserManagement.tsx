import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { usersApi, assessmentsApi, sessionsApi, alertsApi, auditApi } from '@/lib/api';
import { mapUser, mapSession, type UiUser } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, Edit2, Trash2, Shield, Filter, Loader2, AlertCircle, PlusCircle, FileText, ShieldCheck } from 'lucide-react';
import type { UserRole } from '@/types/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  generateUserDirectoryReport,
  generateComplianceReport,
  type UserDirectoryRow,
  type ComplianceReportData,
} from '@/lib/reportPdf';

const ROLE_COLORS: Record<UserRole, string> = {
  candidate: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  recruiter: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
  admin: 'bg-primary/10 text-primary border-primary/30',
};
const STATUS_COLORS = {
  active: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
  inactive: 'bg-muted text-muted-foreground border-border',
  suspended: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
};

function safeDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'MMM d, HH:mm');
}

const UserManagement: React.FC = () => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    fullName: '',
    email: '',
    password: 'recruiter123',
    role: 'recruiter' as UserRole,
    department: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const { data, loading, error, reload } = useAsync(() => usersApi.list({ perPage: 200 }), []);
  const allUsers: UiUser[] = (data?.items ?? []).map(mapUser);

  const { data: assessmentsData } = useAsync(() => assessmentsApi.list({ perPage: 200 }), []);
  const { data: sessionsData } = useAsync(() => sessionsApi.list({ perPage: 200 }), []);
  const { data: alertsData } = useAsync(() => alertsApi.list({ perPage: 200 }), []);
  const { data: auditData } = useAsync(() => auditApi.list({ perPage: 200 }), []);

  const [downloadingDir, setDownloadingDir] = useState(false);
  const [downloadingCompliance, setDownloadingCompliance] = useState(false);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.fullName.trim() || !addForm.email.trim() || !addForm.password.trim()) {
      toast.error('Name, email, and password are required');
      return;
    }
    setSubmitting(true);
    try {
      await usersApi.create(addForm);
      toast.success(`Successfully created ${addForm.role}: ${addForm.email}`);
      setShowAddModal(false);
      setAddForm({
        fullName: '',
        email: '',
        password: 'recruiter123',
        role: 'recruiter',
        department: '',
      });
      reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = allUsers.filter(u =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    (statusFilter === 'all' || u.status === statusFilter) &&
    (search === '' || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  );

  const setStatus = async (u: UiUser, status: 'active' | 'suspended') => {
    try {
      await usersApi.setStatus(u.id, status);
      toast.success(status === 'suspended' ? `Suspended ${u.name}` : `Reinstated ${u.name}`);
      reload();
    } catch {
      toast.error('Could not update user status');
    }
  };
  const remove = async (u: UiUser) => {
    try {
      await usersApi.remove(u.id);
      toast.success(`Deleted ${u.name}`);
      reload();
    } catch {
      toast.error('Could not delete user');
    }
  };

  const downloadDirectory = async () => {
    if (allUsers.length === 0) {
      toast.error('No users to export.');
      return;
    }
    setDownloadingDir(true);
    try {
      const rows: UserDirectoryRow[] = allUsers.map(u => ({
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        department: u.department || '—',
        createdAt: safeDate(u.createdAt),
        lastLogin: u.lastLogin ? safeDate(u.lastLogin) : '—',
      }));
      const meta = {
        total: allUsers.length,
        candidates: allUsers.filter(u => u.role === 'candidate').length,
        recruiters: allUsers.filter(u => u.role === 'recruiter').length,
        admins: allUsers.filter(u => u.role === 'admin').length,
      };
      const stamp = format(new Date(), 'yyyyMMdd-HHmm');
      await generateUserDirectoryReport(rows, meta, `SemanticGuard-User-Directory-${stamp}.pdf`);
      toast.success('User directory report downloaded.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate the user directory report.');
    } finally {
      setDownloadingDir(false);
    }
  };

  const downloadCompliance = async () => {
    setDownloadingCompliance(true);
    try {
      const sessions = (sessionsData?.items ?? []).map(mapSession);
      const completed = sessions.filter(s => s.status === 'completed');
      const avgIntegrity = completed.length
        ? Math.round((completed.reduce((a, s) => a + s.integrityScore, 0) / completed.length) * 10) / 10
        : 0;
      const auditRows = auditData?.items ?? [];
      const data: ComplianceReportData = {
        totalUsers: allUsers.length,
        activeUsers: allUsers.filter(u => u.status === 'active').length,
        suspendedUsers: allUsers.filter(u => u.status === 'suspended').length,
        mfaEnabled: allUsers.filter(u => u.mfaEnabled).length,
        totalAssessments: assessmentsData?.meta?.total ?? (assessmentsData?.items?.length ?? 0),
        totalSessions: sessionsData?.meta?.total ?? sessions.length,
        flaggedSessions: (sessionsData?.items ?? []).filter(s => s.status === 'flagged').length,
        totalAlerts: alertsData?.meta?.total ?? (alertsData?.items?.length ?? 0),
        unreviewedAlerts: (alertsData?.items ?? []).filter(a => !a.reviewed).length,
        avgIntegrity,
        auditTotal: auditData?.meta?.total ?? auditRows.length,
        auditFailures: auditRows.filter(a => a.status === 'failure').length,
      };
      const stamp = format(new Date(), 'yyyyMMdd-HHmm');
      await generateComplianceReport(data, `SemanticGuard-Compliance-Summary-${stamp}.pdf`);
      toast.success('Compliance summary downloaded.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate the compliance summary.');
    } finally {
      setDownloadingCompliance(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">User Management</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{filtered.length} of {allUsers.length} users</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={downloadDirectory} disabled={downloadingDir}>
              {downloadingDir
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing…</>
                : <><FileText className="w-4 h-4 mr-2" /> User Directory</>}
            </Button>
            <Button size="sm" variant="outline" onClick={downloadCompliance} disabled={downloadingCompliance}>
              {downloadingCompliance
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing…</>
                : <><ShieldCheck className="w-4 h-4 mr-2" /> Compliance Summary</>}
            </Button>
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <PlusCircle className="w-4 h-4 mr-2" /> Add User
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className="pl-9" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['all', 'candidate', 'recruiter', 'admin'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={cn('px-3 py-1.5 text-xs transition-colors capitalize', roleFilter === r ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                >{r}</button>
              ))}
            </div>
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['all', 'active', 'suspended'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn('px-3 py-1.5 text-xs transition-colors capitalize', statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                >{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary row */}
        <div className="flex gap-4 flex-wrap">
          {[
            { label: 'Candidates', value: allUsers.filter(u => u.role === 'candidate').length },
            { label: 'Recruiters', value: allUsers.filter(u => u.role === 'recruiter').length },
            { label: 'Admins', value: allUsers.filter(u => u.role === 'admin').length },
            { label: 'Suspended', value: allUsers.filter(u => u.status === 'suspended').length },
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
                  {['User', 'Role', 'Status', 'MFA', 'Last Login', 'Actions'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      <Loader2 className="w-5 h-5 animate-spin inline mr-2 text-primary" /> Loading users…
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm">
                      <AlertCircle className="w-5 h-5 inline mr-2 text-destructive" /> {error}
                      <Button size="sm" variant="outline" className="ml-3" onClick={reload}>Retry</Button>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No users found</td>
                  </tr>
                ) : (
                  filtered.map(user => (
                    <tr key={user.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                            {user.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{user.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs px-2 py-0.5 rounded border capitalize ${ROLE_COLORS[user.role]}`}>{user.role}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs px-2 py-0.5 rounded border capitalize ${STATUS_COLORS[user.status]}`}>{user.status}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs ${user.mfaEnabled ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {user.mfaEnabled ? '✓ On' : '✗ Off'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {safeDate(user.lastLogin)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => toast.info(`Editing ${user.name}`)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          {user.role !== 'admin' && (
                            <>
                              {user.status !== 'suspended' ? (
                                <Button size="sm" variant="ghost" onClick={() => setStatus(user, 'suspended')}>
                                  <Shield className="w-3.5 h-3.5 text-yellow-500" />
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => setStatus(user, 'active')}>
                                  <Shield className="w-3.5 h-3.5 text-green-500" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => remove(user)}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add User Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-lg max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">Add New User</h3>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Full Name</label>
                  <Input
                    required
                    value={addForm.fullName}
                    onChange={e => setAddForm(f => ({ ...f, fullName: e.target.value }))}
                    placeholder="E.g. John Doe"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                  <Input
                    required
                    type="email"
                    value={addForm.email}
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="E.g. johndoe@semanticservices.rw"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Role</label>
                    <select
                      value={addForm.role}
                      onChange={e => setAddForm(f => ({ ...f, role: e.target.value as UserRole }))}
                      aria-label="User role"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="recruiter">Recruiter</option>
                      <option value="candidate">Candidate</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Department</label>
                    <Input
                      value={addForm.department}
                      onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))}
                      placeholder="E.g. Engineering"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Default Password</label>
                  <Input
                    required
                    type="text"
                    value={addForm.password}
                    onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Enter default password"
                  />
                  <p className="text-[10px] text-muted-foreground">Users can log in with this password and change it in their profile later.</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create User'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default UserManagement;
