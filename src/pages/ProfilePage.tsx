import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { authApi, assessmentsApi, ApiError } from '@/lib/api';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { User, Lock, Camera, Key, Briefcase, ShieldCheck, Mail } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ProfilePage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const isRecruiter = user?.role === 'recruiter';

  const { data: me } = useAsync(() => authApi.me(), []);
  const recruiterProfile = me?.user.recruiterProfile ?? null;

  const { data: myAssessments } = useAsync(
    () => (isRecruiter ? assessmentsApi.list({ perPage: 100 }) : Promise.resolve(null)),
    [isRecruiter],
  );
  const ownedAssessments = (myAssessments?.items ?? []).filter(a => a.recruiterId === user?.id);

  const department = isRecruiter ? (recruiterProfile?.department ?? '—') : 'Administration';
  const idLabel = isRecruiter ? (recruiterProfile?.recruiterCode ?? '—') : (user?.id?.toUpperCase() ?? '—');
  const roleLabel = isRecruiter ? 'Recruiter' : 'Administrator';
  const totalAssessmentsCreated = recruiterProfile?.totalAssessmentsCreated ?? ownedAssessments.length;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    department,
  });

  // ─── Email-based MFA ───
  const mfaEnabled = user?.mfaEnabled ?? false;
  const mfaMethod = user?.mfaMethod ?? 'email';
  const [mfaMode, setMfaMode] = useState<'idle' | 'enabling' | 'disabling'>('idle');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  const startEnableMfa = async () => {
    setMfaBusy(true);
    try {
      const res = await authApi.mfaSetup('email');
      toast.success(res.message ?? `Code sent to ${user?.email}`);
      setMfaMode('enabling');
      setMfaCode('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start MFA setup');
    } finally {
      setMfaBusy(false);
    }
  };

  const startDisableMfa = async () => {
    setMfaBusy(true);
    try {
      // Email a fresh code so the user can confirm the change.
      if (mfaMethod === 'email') {
        await authApi.mfaResend();
        toast.info(`We emailed a confirmation code to ${user?.email}`);
      }
      setMfaMode('disabling');
      setMfaCode('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start disable flow');
    } finally {
      setMfaBusy(false);
    }
  };

  const submitMfaCode = async () => {
    if (mfaCode.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setMfaBusy(true);
    try {
      if (mfaMode === 'enabling') {
        await authApi.mfaConfirm(mfaCode);
        toast.success('Email MFA enabled');
      } else {
        await authApi.mfaDisable(mfaCode);
        toast.success('MFA disabled');
      }
      await refreshUser();
      setMfaMode('idle');
      setMfaCode('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Invalid or expired code');
    } finally {
      setMfaBusy(false);
    }
  };

  const resendMfaCode = async () => {
    setMfaBusy(true);
    try {
      await authApi.mfaResend();
      toast.success('A new code was sent to your email');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not resend the code');
    } finally {
      setMfaBusy(false);
    }
  };

  const cancelMfa = () => {
    setMfaMode('idle');
    setMfaCode('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setEditing(false);
    toast.success('Profile updated successfully');
  };

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        <h1 className="text-xl font-bold text-balance">My Profile</h1>

        {/* Profile header */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {/* Gradient cover */}
          <div className="h-24 bg-gradient-to-r from-primary/80 via-primary/50 to-sky-400/40 relative">
            <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:16px_16px]" />
          </div>

          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-5">
              {/* Avatar (overlaps banner) */}
              <div className="relative shrink-0 -mt-12">
                <div className="w-24 h-24 rounded-full bg-card ring-4 ring-card shadow-md flex items-center justify-center overflow-hidden">
                  <div className="w-full h-full rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                    <User className="w-12 h-12 text-primary" />
                  </div>
                </div>
                <button className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center ring-2 ring-card hover:opacity-90 transition-opacity">
                  <Camera className="w-3.5 h-3.5 text-primary-foreground" />
                </button>
              </div>

              {/* Name + meta */}
              <div className="flex-1 min-w-0 pt-1 sm:pt-0">
                <h2 className="text-xl font-bold text-balance">{user?.name}</h2>
                <p className="text-muted-foreground text-sm">{user?.email}</p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">{idLabel}</span>
                  <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full border border-border">{department}</span>
                  <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full border border-border">{roleLabel}</span>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 shrink-0 rounded-xl bg-muted/40 border border-border px-4 py-3">
                <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-green-600 dark:text-green-400">Active</p>
                  <p className="text-[10px] text-muted-foreground">Verified account</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="info">
          <TabsList className="bg-muted">
            <TabsTrigger value="info">Personal Info</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            {isRecruiter && <TabsTrigger value="courses">Requisitions</TabsTrigger>}
          </TabsList>

          {/* Personal Info */}
          <TabsContent value="info" className="mt-4">
            <div className="bg-card border border-border rounded-md p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-sm flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Personal Information</h3>
                {!editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-normal">Full Name</Label>
                    <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={!editing} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-normal">{isRecruiter ? 'Recruiter ID' : 'Admin ID'}</Label>
                    <Input value={idLabel} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-normal">Email</Label>
                    <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} disabled={!editing} type="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-normal">Department</Label>
                    <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} disabled={!editing} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-normal">Role</Label>
                    <Input value={roleLabel} disabled />
                  </div>
                </div>
                {editing && (
                  <div className="flex gap-3 pt-2">
                    <Button type="submit">Save Changes</Button>
                    <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                )}
              </form>
            </div>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="mt-4 space-y-4">
            <div className="bg-card border border-border rounded-md p-5">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-5"><Lock className="w-4 h-4 text-primary" /> Change Password</h3>
              <form onSubmit={e => { e.preventDefault(); toast.success('Password updated'); }} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Current Password</Label>
                  <Input type="password" placeholder="••••••••" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">New Password</Label>
                  <Input type="password" placeholder="Min. 8 characters" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Confirm New Password</Label>
                  <Input type="password" placeholder="Re-enter new password" />
                </div>
                <Button type="submit" size="sm">Update Password</Button>
              </form>
            </div>
            <div className="bg-card border border-border rounded-md p-5">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-4"><Key className="w-4 h-4 text-primary" /> Two-Factor Authentication</h3>

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground flex items-center gap-2">
                    {mfaEnabled ? (
                      <><ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" /> Email MFA is enabled</>
                    ) : (
                      'Two-factor authentication is off'
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    {mfaEnabled
                      ? <>A one-time code is emailed to <span className="font-medium text-foreground">{user?.email}</span> at each sign-in.</>
                      : <>Get a one-time code at <span className="font-medium text-foreground">{user?.email}</span> every time you sign in.</>}
                  </p>
                </div>

                {/* Toggle */}
                <button
                  type="button"
                  disabled={mfaBusy || mfaMode !== 'idle'}
                  onClick={() => (mfaEnabled ? startDisableMfa() : startEnableMfa())}
                  aria-label={mfaEnabled ? 'Disable email MFA' : 'Enable email MFA'}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${mfaEnabled ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${mfaEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Code entry (enabling or disabling) */}
              {mfaMode !== 'idle' && (
                <div className="mt-5 pt-5 border-t border-border space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {mfaMode === 'enabling'
                      ? <>Enter the 6-digit code we emailed to <span className="font-medium text-foreground">{user?.email}</span> to turn on MFA.</>
                      : <>Enter the 6-digit code we emailed you to confirm turning MFA off.</>}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <Input
                      value={mfaCode}
                      onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      inputMode="numeric"
                      maxLength={6}
                      className="sm:w-40 text-center tracking-[0.4em] font-mono"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={submitMfaCode} disabled={mfaBusy || mfaCode.length !== 6}>
                        {mfaBusy ? 'Verifying…' : mfaMode === 'enabling' ? 'Enable MFA' : 'Confirm'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={resendMfaCode} disabled={mfaBusy}>
                        Resend
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelMfa} disabled={mfaBusy}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Requisitions (recruiter only) */}
          {isRecruiter && (
            <TabsContent value="courses" className="mt-4">
              <div className="bg-card border border-border rounded-md p-5">
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-5"><Briefcase className="w-4 h-4 text-primary" /> My Assessments</h3>
                {ownedAssessments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No assessments created yet.</p>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ownedAssessments.map(req => (
                    <div key={req.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Briefcase className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground truncate">{req.title}</span>
                    </div>
                  ))}
                </div>
                )}
                <p className="text-xs text-muted-foreground mt-4">{totalAssessmentsCreated} assessments created in total</p>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default ProfilePage;
