import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Shield, Eye, EyeOff, Lock, Mail, ChevronDown,
  AlertCircle, CheckCircle2, ArrowRight, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandMark } from '@/components/common/Logo';
import type { UserRole } from '@/types/types';
import { toast } from 'sonner';

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const ROLE_REDIRECTS: Record<UserRole, string> = {
  candidate: '/candidate/dashboard',
  recruiter: '/recruiter/dashboard',
  admin:     '/admin/dashboard',
};

/* ─── Feature list for brand panel ─────────────────────────────────────────── */
const FEATURES = [
  'Face Recognition & Live Verification',
  'Real-time AI Behavioral Analysis',
  'YOLO Phone Detection (97% accuracy)',
  'Comprehensive Audit Trails',
];

/* ─── Left Brand Panel ──────────────────────────────────────────────────────── */
const BrandPanel: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId: number;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * (canvas.width || 500),
      y: Math.random() * (canvas.height || 700),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.2 + 0.4,
      alpha: Math.random() * 0.25 + 0.05,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        /* Sky-blue particles on navy */
        ctx.fillStyle = `rgba(74,144,226,${p.alpha})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <div
      className="relative hidden lg:flex lg:w-[52%] flex-col justify-between p-12 overflow-hidden"
      style={{ background: 'linear-gradient(160deg, hsl(214,68%,19%) 0%, hsl(214,64%,28%) 100%)' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />
      {/* Dot grid */}
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(74,144,226,0.10) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
      {/* Soft glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[380px] h-[380px] rounded-full blur-[90px] pointer-events-none z-0"
        style={{ background: 'rgba(74,144,226,0.10)' }} />

      {/* Logo */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        className="relative z-10 flex items-center gap-3">
        <BrandMark size={40} />
        <div>
          <p className="text-white font-bold text-lg">SemanticGuard <span style={{ color: 'hsl(211,73%,59%)' }}>AI</span></p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Recruitment Integrity Platform</p>
        </div>
      </motion.div>

      {/* Main content */}
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
        className="relative z-10">
        {/* Scan animation */}
        <div className="w-full h-32 rounded-xl mb-8 relative overflow-hidden flex items-center justify-center"
          style={{ background: 'rgba(74,144,226,0.06)', border: '1px solid rgba(74,144,226,0.20)' }}>
          <Shield className="w-12 h-12" style={{ color: 'rgba(74,144,226,0.25)' }} />
          <motion.div
            animate={{ y: ['-100%', '200%'] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: 'linear', repeatDelay: 1 }}
            className="absolute left-0 right-0 h-0.5"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(74,144,226,0.65), transparent)' }}
          />
          <div className="absolute top-2 left-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'hsl(211,73%,59%)' }} />
            <span className="text-xs font-mono" style={{ color: 'rgba(74,144,226,0.70)' }}>AI SCANNING</span>
          </div>
          <div className="absolute bottom-2 right-3 text-xs font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
            94.2% accuracy
          </div>
        </div>

        <h1 className="text-3xl font-bold text-white leading-tight mb-4 text-balance">
          AI-Powered Candidate<br />
          <span style={{ color: 'hsl(211,73%,59%)' }}>Security</span> & Fraud Detection
        </h1>
        <p className="text-sm leading-relaxed mb-8 text-pretty" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Advanced real-time monitoring using Computer Vision, Behavioral Analytics, and Machine Learning.
        </p>

        <div className="space-y-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
              className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{ border: '1px solid rgba(74,144,226,0.40)' }}>
                <CheckCircle2 className="w-3 h-3" style={{ color: 'hsl(211,73%,62%)' }} />
              </div>
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{f}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
        className="relative z-10 text-xs" style={{ color: 'rgba(255,255,255,0.20)' }}>
        © 2026 SemanticGuard AI
      </motion.p>
    </div>
  );
};

/* ─── Main Login ─────────────────────────────────────────────────────────────── */
const LoginPage: React.FC = () => {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState<UserRole>('candidate');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [mfaStep, setMfaStep]   = useState(false);
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('email');
  const [mfaCode, setMfaCode]   = useState('');
  const [resending, setResending] = useState(false);
  const [success, setSuccess]   = useState(false);

  const goToPortal = (r: UserRole) => {
    setSuccess(true);
    toast.success('Authentication successful');
    setTimeout(() => navigate(ROLE_REDIRECTS[r]), 900);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.status === 'success') { goToPortal(res.user.role); return; }
    if (res.status === 'mfa_required') {
      setMfaMethod(res.method); setMfaCode(''); setError(''); setMfaStep(true);
      if (res.method === 'email') toast.info('We sent a 6-digit verification code to your email and phone.');
      return;
    }
    setError(res.message || 'Invalid email or password.');
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaCode.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setError(''); setLoading(true);
    const res = await verifyMfa(email, password, mfaCode);
    setLoading(false);
    if (res.status === 'success') { goToPortal(res.user.role); return; }
    setError(res.status === 'error' ? res.message : 'Verification failed.');
  };

  const handleResend = async () => {
    setResending(true); setError('');
    // Re-submitting the credentials makes the backend issue a fresh email code.
    const res = await login(email, password);
    setResending(false);
    if (res.status === 'mfa_required') {
      setMfaCode('');
      toast.success('A new code was sent to your email.');
    } else if (res.status === 'success') {
      goToPortal(res.user.role);
    } else {
      setError(res.message || 'Could not resend the code.');
    }
  };

  const fv = {
    hidden: { opacity: 0, x: 16 },
    visible: (i: number) => ({ opacity: 1, x: 0, transition: { delay: i * 0.1, duration: 0.4, ease: 'easeOut' as const } }),
  };

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: '#F5F7FA' }}>
      <BrandPanel />

      {/* Right panel — white */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white relative">
        <div className="w-full max-w-[380px] relative z-10">

          {/* Mobile logo */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="flex lg:hidden items-center gap-2 mb-8 justify-center">
            <BrandMark size={30} />
            <span className="font-bold text-sm" style={{ color: 'hsl(214,68%,19%)' }}>
              SemanticGuard <span style={{ color: 'hsl(211,73%,59%)' }}>AI</span>
            </span>
          </motion.div>

          <AnimatePresence mode="wait">
            {/* SUCCESS */}
            {success && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: 0.4 }}
                className="flex flex-col items-center justify-center py-16 gap-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ border: '2px solid hsl(214,64%,34%)', background: 'rgba(30,78,140,0.08)' }}>
                  <CheckCircle2 className="w-10 h-10" style={{ color: 'hsl(214,64%,34%)' }} />
                </motion.div>
                <p className="text-lg font-semibold" style={{ color: 'hsl(214,68%,19%)' }}>Access Granted</p>
                <p className="text-sm text-muted-foreground">Redirecting to your portal…</p>
                <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8 }}
                  className="h-0.5 w-40 rounded-full origin-left mt-2"
                  style={{ background: 'hsl(214,64%,34%)' }} />
              </motion.div>
            )}

            {/* MFA */}
            {!success && mfaStep && (
              <motion.div key="mfa" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                <div className="flex flex-col items-center mb-8">
                  <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                    style={{ border: '2px solid rgba(214,64%,34%,0.3)', background: 'rgba(30,78,140,0.08)' }}>
                    <Shield className="w-8 h-8" style={{ color: 'hsl(214,64%,34%)' }} />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-balance" style={{ color: 'hsl(214,68%,19%)' }}>Two-Factor Auth</h2>
                  <p className="text-sm mt-1 text-muted-foreground text-center text-balance">
                    {mfaMethod === 'email'
                      ? <>Enter the code we sent to <span className="font-medium text-foreground">{email}</span> and your phone by SMS</>
                      : 'Enter the 6-digit code from your authenticator app'}
                  </p>
                </div>
                <form onSubmit={handleMfaSubmit} className="space-y-4">
                  <motion.div custom={0} variants={fv} initial="hidden" animate="visible">
                    <label className="text-xs block mb-1.5 text-muted-foreground font-normal">Verification Code</label>
                    <input value={mfaCode}
                      onChange={e => setMfaCode(e.target.value.replace(/\D/, '').slice(0, 6))}
                      placeholder="• • • • • •"
                      className="w-full h-11 rounded-lg border border-border bg-muted/30 text-foreground text-center text-xl tracking-[0.5em] font-mono px-4 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
                      maxLength={6} required autoFocus />
                    {mfaMethod === 'email' && (
                      <div className="mt-2 text-center">
                        <button type="button" onClick={handleResend} disabled={resending}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                          {resending ? 'Sending…' : "Didn't get it? Resend code"}
                        </button>
                      </div>
                    )}
                  </motion.div>
                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />{error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <motion.button custom={1} variants={fv} initial="hidden" animate="visible"
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    type="submit" disabled={loading}
                    className="w-full h-11 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 text-white transition-colors disabled:opacity-60"
                    style={{ background: 'hsl(211,73%,59%)', boxShadow: '0 2px 10px rgba(74,144,226,0.35)' }}>
                    {loading ? (
                      <>
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                        Verifying…
                      </>
                    ) : (
                      <><Zap className="w-4 h-4" /> Verify &amp; Sign In</>
                    )}
                  </motion.button>
                  <button type="button" onClick={() => { setMfaStep(false); setError(''); setMfaCode(''); }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground text-center transition-colors py-1">
                    ← Back to login
                  </button>
                </form>
              </motion.div>
            )}

            {/* MAIN LOGIN */}
            {!success && !mfaStep && (
              <motion.div key="login" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="mb-6">
                  <h2 className="text-2xl font-bold text-balance" style={{ color: 'hsl(214,68%,19%)' }}>Welcome Back</h2>
                  <p className="text-sm mt-1 text-muted-foreground">Sign in to your recruitment portal</p>
                </motion.div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Role */}
                  <motion.div custom={0} variants={fv} initial="hidden" animate="visible">
                    <label className="text-xs block mb-1.5 text-muted-foreground font-normal">Role</label>
                    <div className="relative">
                      <select value={role} onChange={e => setRole(e.target.value as UserRole)}
                        className="w-full h-11 pl-3 pr-8 rounded-lg border border-border bg-card text-foreground text-sm appearance-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all">
                        <option value="candidate">Candidate</option>
                        <option value="recruiter">Recruiter</option>
                        <option value="admin">Administrator</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </motion.div>

                  {/* Email */}
                  <motion.div custom={1} variants={fv} initial="hidden" animate="visible">
                    <label className="text-xs block mb-1.5 text-muted-foreground font-normal">Email Address</label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="your@semanticservices.rw"
                        className="w-full h-11 pl-9 pr-3 rounded-lg border border-border bg-card text-foreground text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        required />
                    </div>
                  </motion.div>

                  {/* Password */}
                  <motion.div custom={2} variants={fv} initial="hidden" animate="visible">
                    <label className="text-xs block mb-1.5 text-muted-foreground font-normal">Password</label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-11 pl-9 pr-10 rounded-lg border border-border bg-card text-foreground text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        required />
                      <button type="button" onClick={() => setShowPass(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.div>

                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />{error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit — Royal Blue */}
                  <motion.div custom={3} variants={fv} initial="hidden" animate="visible">
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      type="submit" disabled={loading}
                      className="w-full h-11 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 text-white transition-all disabled:opacity-60"
                      style={{ background: 'hsl(211,73%,59%)', boxShadow: '0 2px 10px rgba(74,144,226,0.35)' }}>
                      {loading ? (
                        <>
                          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                            className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                          Authenticating…
                        </>
                      ) : (
                        <>Sign In <ArrowRight className="w-4 h-4" /></>
                      )}
                    </motion.button>
                  </motion.div>

                  {/* Gold CTA link */}
                  <p className="text-center text-xs text-muted-foreground">
                    New candidate?{' '}
                    <Link to="/register" className="font-semibold transition-colors hover:underline"
                      style={{ color: 'hsl(214,64%,34%)' }}>Register here</Link>
                    {' · '}
                    <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">Back to home</Link>
                  </p>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
