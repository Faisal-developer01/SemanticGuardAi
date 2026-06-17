import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { authApi, ApiError } from '@/lib/api';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IntegrityScore, RiskBadge } from '@/components/shared/StatusBadges';
import { toast } from 'sonner';
import { User, Shield, Lock, Camera, CheckCircle2, Key } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CandidateProfile: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { data: me } = useAsync(() => authApi.me(), []);
  const profile = me?.user.candidateProfile ?? null;

  const candidate = {
    name: user?.name ?? '',
    email: user?.email ?? '',
    department: profile?.department ?? '',
    candidateId: profile?.candidateCode ?? '—',
    position: profile?.position ?? '—',
    experienceYears: profile?.experienceYears ?? 0,
    integrityScore: profile?.integrityScore ?? 100,
  };

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: candidate.name, email: candidate.email, department: candidate.department });

  // Keep the form in sync once the profile resolves.
  React.useEffect(() => {
    setForm({ name: candidate.name, email: candidate.email, department: candidate.department });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setEditing(false);
    toast.success('Profile updated successfully');
  };

  // ─── Change password (real) ───
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (pw.next !== pw.confirm) { toast.error('Passwords do not match'); return; }
    setPwBusy(true);
    try {
      await authApi.changePassword(pw.current, pw.next);
      toast.success('Password updated');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update password');
    } finally {
      setPwBusy(false);
    }
  };

  // ─── Email-based MFA (real) ───
  const mfaEnabled = user?.mfaEnabled ?? false;
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
      await authApi.mfaResend();
      toast.info(`We emailed a confirmation code to ${user?.email}`);
      setMfaMode('disabling');
      setMfaCode('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start disable flow');
    } finally {
      setMfaBusy(false);
    }
  };

  const submitMfaCode = async () => {
    if (mfaCode.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setMfaBusy(true);
    try {
      if (mfaMode === 'enabling') {
        await authApi.mfaConfirm(mfaCode);
        toast.success('Email MFA enabled');
      } else {
        await authApi.mfaDisable(mfaCode);
        toast.success('Email MFA disabled');
      }
      setMfaMode('idle');
      setMfaCode('');
      await refreshUser();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Invalid or expired code');
    } finally {
      setMfaBusy(false);
    }
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
                <h2 className="text-xl font-bold text-balance">{candidate.name}</h2>
                <p className="text-muted-foreground text-sm">{candidate.email}</p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">{candidate.candidateId}</span>
                  <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full border border-border">{candidate.department}</span>
                  <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full border border-border">{candidate.experienceYears} yrs experience</span>
                </div>
              </div>

              {/* Score (solid card so text stays readable) */}
              <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:gap-2.5 shrink-0 rounded-xl bg-muted/40 border border-border px-4 py-3">
                <IntegrityScore score={candidate.integrityScore} size="md" />
                <RiskBadge level="low" score={8} />
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="info">
          <TabsList className="bg-muted">
            <TabsTrigger value="info">Personal Info</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="biometric">Biometrics</TabsTrigger>
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
                    <Label className="text-sm font-normal">Candidate ID</Label>
                    <Input value={candidate.candidateId} disabled />
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
                    <Label className="text-sm font-normal">Position</Label>
                    <Input value={candidate.position} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-normal">Experience</Label>
                    <Input value={`${candidate.experienceYears} yrs`} disabled />
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
              <form onSubmit={submitPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Current Password</Label>
                  <Input type="password" placeholder="••••••••" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">New Password</Label>
                  <Input type="password" placeholder="Min. 8 characters" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Confirm New Password</Label>
                  <Input type="password" placeholder="Re-enter new password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
                </div>
                <Button type="submit" size="sm" disabled={pwBusy}>{pwBusy ? 'Updating…' : 'Update Password'}</Button>
              </form>
            </div>
            <div className="bg-card border border-border rounded-md p-5">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-4"><Key className="w-4 h-4 text-primary" /> Two-Factor Authentication</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">{mfaEnabled ? 'Email MFA is enabled' : 'Email MFA is disabled'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Adds an extra layer of security to your account</p>
                </div>
                {mfaMode === 'idle' && (
                  mfaEnabled ? (
                    <Button size="sm" variant="outline" onClick={startDisableMfa} disabled={mfaBusy}>Disable</Button>
                  ) : (
                    <Button size="sm" onClick={startEnableMfa} disabled={mfaBusy}>Enable</Button>
                  )
                )}
              </div>
              {mfaMode !== 'idle' && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code we emailed to <span className="font-medium text-foreground">{user?.email}</span>.
                  </p>
                  <Input
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    inputMode="numeric"
                    className="max-w-[160px] tracking-[0.3em] text-center font-mono"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={submitMfaCode} disabled={mfaBusy || mfaCode.length !== 6}>
                      {mfaBusy ? 'Verifying…' : mfaMode === 'enabling' ? 'Enable MFA' : 'Confirm'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setMfaMode('idle'); setMfaCode(''); }} disabled={mfaBusy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Biometrics */}
          <TabsContent value="biometric" className="mt-4">
            <div className="bg-card border border-border rounded-md p-5">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-5"><Shield className="w-4 h-4 text-primary" /> Biometric Data</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div className="aspect-square max-w-[180px] bg-muted rounded-md border border-border flex flex-col items-center justify-center gap-2">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                  <p className="text-xs font-medium text-green-500">Face Registered</p>
                  <p className="text-xs text-muted-foreground text-center px-4">Identity hash encrypted and stored</p>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Registration Date', value: '2021-09-01' },
                    { label: 'Last Verified', value: '2026-05-31' },
                    { label: 'Verification Method', value: 'MediaPipe FaceDetection' },
                    { label: 'Data Encryption', value: 'AES-256' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
                      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                      <span className="text-xs text-foreground text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => toast.success('Face re-capture initiated (mock)')}>
                <Camera className="w-4 h-4 mr-2" /> Re-capture Face
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default CandidateProfile;
