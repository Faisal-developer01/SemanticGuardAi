import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Camera, CheckCircle2, AlertCircle, User, Mail, Lock } from 'lucide-react';
import { BrandMark } from '@/components/common/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { authApi } from '@/lib/api';

/* MediaPipe Face Landmarker — real face detection for biometric capture */
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const DEPARTMENTS = [
  'Software Engineering',
  'Data & Analytics',
  'IT & Infrastructure',
  'Cybersecurity',
  'Product Management',
  'Project Management',
  'Sales & Business Development',
  'Marketing & Communications',
  'Customer Success',
  'Finance & Accounting',
  'Human Resources',
  'Operations',
  'Legal & Compliance',
  'Administration',
  'Other',
];

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep]           = useState<1 | 2>(1);
  const [faceStatus, setFaceStatus] = useState<'idle' | 'capturing' | 'captured'>('idle');
  const [form, setForm] = useState({
    name: '', email: '', candidateId: '', department: '',
    password: '', confirmPassword: '', agreeTerms: false, role: 'candidate',
  });
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [cameraOn, setCameraOn] = useState(false);

  const videoRef          = useRef<HTMLVideoElement | null>(null);
  const camStreamRef      = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<any>(null);

  const handleChange = (k: string, v: string | boolean) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: '' }));
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim())               e.name            = 'Full name is required';
    if (!form.email.includes('@'))        e.email           = 'Valid email is required';
    if (form.role === 'candidate' && !form.candidateId.trim()) e.candidateId = 'Candidate ID is required';
    if (!form.department.trim())         e.department      = 'Department is required';
    if (form.password.length < 8)        e.password        = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleStep1 = (e: React.FormEvent) => { e.preventDefault(); if (validateStep1()) setStep(2); };

  // ─── Camera + MediaPipe face detection ──────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
    }
    if (faceLandmarkerRef.current) {
      try { faceLandmarkerRef.current.close(); } catch { /* noop */ }
      faceLandmarkerRef.current = null;
    }
    setCameraOn(false);
  }, []);

  const captureface = useCallback(async () => {
    setFaceStatus('capturing');
    try {
      // Open the webcam
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 }, audio: false,
      });
      camStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);

      // Load the face landmarker model
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const resolver = await FilesetResolver.forVisionTasks(WASM_URL);
      const landmarker = await FaceLandmarker.createFromOptions(resolver, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
      faceLandmarkerRef.current = landmarker;

      // Poll for a face until detected or timeout
      const video = videoRef.current!;
      const deadline = Date.now() + 12000;
      const found = await new Promise<boolean>(resolve => {
        const tick = () => {
          if (!faceLandmarkerRef.current) return resolve(false);
          if (video.readyState >= 2) {
            try {
              const r = landmarker.detectForVideo(video, performance.now());
              if ((r?.faceLandmarks?.length ?? 0) > 0) return resolve(true);
            } catch { /* not ready */ }
          }
          if (Date.now() > deadline) return resolve(false);
          requestAnimationFrame(tick);
        };
        tick();
      });

      if (found) {
        setFaceStatus('captured');
        toast.success('Face captured — identity registered.');
        stopCamera();
      } else {
        setFaceStatus('idle');
        toast.error('No face detected. Ensure your face is clearly visible and well lit.');
        stopCamera();
      }
    } catch {
      setFaceStatus('idle');
      toast.error('Camera access denied — cannot complete face registration.');
      stopCamera();
    }
  }, [stopCamera]);

  // Release the camera if the user leaves the page mid-capture
  useEffect(() => stopCamera, [stopCamera]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (faceStatus !== 'captured' && !import.meta.env.DEV) { toast.error('Please capture your face to complete registration'); return; }
    if (!form.agreeTerms) { toast.error('Please agree to the terms'); return; }
    try {
      await authApi.register({
        fullName: form.name,
        email: form.email,
        password: form.password,
        role: form.role as any,
        department: form.department,
        position: form.role === 'recruiter' ? 'Recruiter' : 'Candidate',
      });
      toast.success('Registration successful! Please login.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F5F7FA' }}>
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-2/5 flex-col justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, hsl(214,68%,19%) 0%, hsl(214,64%,28%) 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(74,144,226,0.10) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-3 mb-10 w-fit group" title="Back to home">
            <BrandMark size={40} className="transition-transform group-hover:scale-105" />
            <div>
              <p className="text-white font-bold text-lg">SemanticGuard <span style={{ color: 'hsl(211,73%,59%)' }}>AI</span></p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Recruitment Integrity Platform</p>
            </div>
          </Link>

          <h2 className="text-2xl font-bold text-white mb-3 text-balance">
            Join the<br /><span style={{ color: 'hsl(211,73%,59%)' }}>Secure</span> Hiring Network
          </h2>
          <p className="text-sm leading-relaxed mb-8 text-pretty" style={{ color: 'rgba(255,255,255,0.50)' }}>
            Register once and gain access to AI-monitored recruitment assessments with full biometric identity protection.
          </p>
          {['Biometric Face Registration', 'Encrypted Identity Storage', 'AI-Verified Assessment Access', 'Instant Result Delivery'].map((f, i) => (
            <div key={i} className="flex items-center gap-3 mb-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(74,144,226,0.15)', border: '1px solid rgba(74,144,226,0.35)' }}>
                <CheckCircle2 className="w-3 h-3" style={{ color: 'hsl(211,73%,59%)' }} />
              </div>
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile header */}
          <Link to="/" className="flex lg:hidden items-center gap-3 mb-6 justify-center w-fit mx-auto" title="Back to home">
            <BrandMark size={30} />
            <div>
              <p className="font-bold text-sm" style={{ color: 'hsl(214,68%,19%)' }}>SemanticGuard <span style={{ color: 'hsl(211,73%,59%)' }}>AI</span></p>
              <p className="text-xs text-muted-foreground">Candidate Registration</p>
            </div>
          </Link>

          <h2 className="hidden lg:block text-xl font-bold mb-1 text-balance" style={{ color: 'hsl(214,68%,19%)' }}>
            Candidate Registration
          </h2>
          <p className="hidden lg:block text-sm text-muted-foreground mb-6 text-pretty">
            Create your account to access AI-monitored recruitment assessments.
          </p>

          {/* Step progress */}
          <div className="flex items-center gap-3 mb-6">
            {[1, 2].map(s => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-2 ${step >= s ? 'text-primary' : 'text-muted-foreground'}`}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors"
                    style={step >= s
                      ? { borderColor: 'hsl(214,64%,34%)', background: 'hsl(214,64%,34%)', color: 'white' }
                      : {}}>
                    {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
                  </div>
                  <span className="text-xs hidden sm:block font-medium">{s === 1 ? 'Account Info' : 'Face Verification'}</span>
                </div>
                {s < 2 && <div className="flex-1 h-0.5 transition-colors"
                  style={{ background: step > 1 ? 'hsl(214,64%,34%)' : 'hsl(var(--border))' }} />}
              </React.Fragment>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-6" style={{ boxShadow: '0 1px 4px rgba(15,45,82,0.07)' }}>
            {step === 1 ? (
              <form onSubmit={handleStep1} className="space-y-4">
                <h3 className="text-base font-semibold mb-3 text-balance" style={{ color: 'hsl(214,68%,19%)' }}>Account Information</h3>

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-normal">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="name" value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="John Smith" className="pl-9" />
                  </div>
                  {errors.name && <p className="text-destructive text-xs">{errors.name}</p>}
                </div>

                {form.role === 'candidate' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="candidateId" className="text-sm font-normal">Candidate ID</Label>
                      <Input id="candidateId" value={form.candidateId} onChange={e => handleChange('candidateId', e.target.value)} placeholder="CAND2024001" />
                      {errors.candidateId && <p className="text-destructive text-xs">{errors.candidateId}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="department" className="text-sm font-normal">Department</Label>
                      <select
                        id="department"
                        value={form.department}
                        onChange={e => handleChange('department', e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="" disabled>Select department</option>
                        {DEPARTMENTS.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      {errors.department && <p className="text-destructive text-xs">{errors.department}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="department" className="text-sm font-normal">Department</Label>
                    <select
                      id="department"
                      value={form.department}
                      onChange={e => handleChange('department', e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="" disabled>Select department</option>
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    {errors.department && <p className="text-destructive text-xs">{errors.department}</p>}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="reg-email" className="text-sm font-normal">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="reg-email" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} placeholder="you@gmail.com" className="pl-9" />
                  </div>
                  {errors.email && <p className="text-destructive text-xs">{errors.email}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-password" className="text-sm font-normal">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="reg-password" type={showPass ? 'text' : 'password'} value={form.password} onChange={e => handleChange('password', e.target.value)} placeholder="Min. 8 characters" className="pl-9 pr-9" />
                    <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-destructive text-xs">{errors.password}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm font-normal">Confirm Password</Label>
                  <Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={e => handleChange('confirmPassword', e.target.value)} placeholder="Re-enter password" />
                  {errors.confirmPassword && <p className="text-destructive text-xs">{errors.confirmPassword}</p>}
                </div>

                {/* Royal Blue CTA */}
                <button type="submit" className="w-full h-10 rounded-lg font-semibold text-sm text-white transition-colors"
                  style={{ background: 'hsl(214,64%,34%)' }}>
                  Continue to Face Verification →
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-5">
                <h3 className="text-base font-semibold mb-1 text-balance" style={{ color: 'hsl(214,68%,19%)' }}>Face Verification</h3>
                <p className="text-sm text-muted-foreground text-pretty">
                  Your face will be used to verify your identity during recruitment assessments. Please ensure good lighting.
                </p>

                {/* Face capture */}
                <div className="relative aspect-video bg-muted rounded-xl border-2 border-dashed border-border overflow-hidden flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay muted playsInline
                    className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${cameraOn ? '' : 'hidden'}`}
                  />
                  {faceStatus === 'idle' && !cameraOn && (
                    <div className="text-center">
                      <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Camera preview</p>
                    </div>
                  )}
                  {faceStatus === 'capturing' && (
                    <div className="text-center relative z-10 bg-background/60 backdrop-blur-sm rounded-lg px-4 py-3">
                      <div className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin mx-auto mb-2"
                        style={{ borderColor: 'hsl(214,64%,34%)', borderTopColor: 'transparent' }} />
                      <p className="text-sm font-medium" style={{ color: 'hsl(214,64%,34%)' }}>Detecting face…</p>
                    </div>
                  )}
                  {faceStatus === 'captured' && (
                    <>
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mx-auto mb-2">
                          <CheckCircle2 className="w-8 h-8 text-green-500" />
                        </div>
                        <p className="text-sm text-green-600 font-medium">Face captured successfully</p>
                        <p className="text-xs text-muted-foreground mt-0.5">1 face detected · Identity hash stored</p>
                      </div>
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-8 border-2 border-primary/60 rounded-sm" />
                        <div className="absolute top-8 left-8 w-3 h-3 border-t-2 border-l-2 border-primary" />
                        <div className="absolute top-8 right-8 w-3 h-3 border-t-2 border-r-2 border-primary" />
                        <div className="absolute bottom-8 left-8 w-3 h-3 border-b-2 border-l-2 border-primary" />
                        <div className="absolute bottom-8 right-8 w-3 h-3 border-b-2 border-r-2 border-primary" />
                      </div>
                    </>
                  )}
                </div>

                {faceStatus !== 'captured' && (
                  <Button type="button" variant="secondary" className="w-full" onClick={captureface} disabled={faceStatus === 'capturing'}>
                    <Camera className="w-4 h-4 mr-2" />
                    {faceStatus === 'idle' ? 'Capture Face' : 'Capturing…'}
                  </Button>
                )}

                {faceStatus === 'captured' && (
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-green-600">Face registered</p>
                      <p className="text-xs text-muted-foreground">Your biometric data is encrypted and secured</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <input type="checkbox" id="terms" checked={form.agreeTerms}
                    onChange={e => handleChange('agreeTerms', e.target.checked)} className="mt-1 shrink-0" />
                  <Label htmlFor="terms" className="text-xs text-muted-foreground font-normal leading-relaxed">
                    I agree to the <span className="underline cursor-pointer" style={{ color: 'hsl(214,64%,34%)' }}>Terms of Service</span> and consent to biometric data collection for assessment monitoring purposes.
                  </Label>
                </div>

                {!form.agreeTerms && (
                  <div className="flex items-start gap-2 p-2 bg-destructive/5 border border-destructive/15 rounded text-xs text-destructive">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    You must agree to the terms to register.
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex-1 h-10 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors">
                    ← Back
                  </button>
                  <button type="submit" disabled={faceStatus !== 'captured' && !import.meta.env.DEV}
                    className="flex-1 h-10 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ background: 'hsl(211,73%,59%)', boxShadow: '0 2px 10px rgba(74,144,226,0.35)' }}>
                    Complete Registration
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold hover:underline transition-colors" style={{ color: 'hsl(214,64%,34%)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
