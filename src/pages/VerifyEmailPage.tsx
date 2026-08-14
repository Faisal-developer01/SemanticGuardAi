import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '@/components/common/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { authApi, ApiError } from '@/lib/api';
import { CheckCircle2, Loader2, Mail, RotateCcw } from 'lucide-react';

const VerifyEmailPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') ?? '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleDigit = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) { toast.error('Enter all 6 digits'); return; }
    setVerifying(true);
    try {
      await authApi.verifyOtp(email, code);
      toast.success('Email verified! You can now log in.');
      navigate('/login');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Verification failed';
      toast.error(msg);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authApi.resendOtp(email);
      toast.success('A new code has been sent to your email.');
      setCooldown(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const retryAfter = (err.payload as any)?.details?.retryAfter ?? 60;
        setCooldown(retryAfter);
        toast.error(`Please wait ${retryAfter}s before requesting another code.`);
      } else {
        toast.error('Could not resend code. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const fetchDevOtp = async () => {
    if (!email) { toast.error('Missing email'); return; }
    const paths = [`/api/v1/auth/dev/otp?email=${encodeURIComponent(email)}`, `/api/auth/dev/otp?email=${encodeURIComponent(email)}`];
    let lastErr = null;
    for (const p of paths) {
      try {
        const res = await fetch(p);
        const data = await res.json();
        if (res.ok && data?.otp) {
          setDevOtp(data.otp);
          setOtp(data.otp.split(''));
          toast.success('Development OTP retrieved');
          return;
        }
        lastErr = data?.error || 'No OTP available';
      } catch (err) {
        lastErr = 'Could not fetch dev OTP';
      } 
    
    }
    toast.error(lastErr || 'Could not fetch dev OTP');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 mb-8 justify-center w-fit mx-auto" title="Back to home">
          <BrandMark size={36} />
          <div>
            <p className="font-bold" style={{ color: 'hsl(214,68%,19%)' }}>
              SemanticGuard <span style={{ color: 'hsl(211,73%,59%)' }}>AI</span>
            </p>
            <p className="text-xs text-muted-foreground">Recruitment Integrity Platform</p>
          </div>
        </Link>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold" style={{ color: 'hsl(214,68%,19%)' }}>Check your email</h1>
            <p className="text-sm text-muted-foreground mt-1 text-pretty">
              We sent a 6-digit verification code to<br />
              <span className="font-medium text-foreground">{email || 'your email address'}</span>
            </p>
          </div>

          {/* 6-digit OTP boxes */}
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className="w-11 h-13 text-center text-xl font-bold rounded-lg border-2 border-input bg-background text-foreground focus:outline-none focus:border-primary transition-colors"
                style={{ height: '3.25rem' }}
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>

          <Button
            className="w-full"
            onClick={handleVerify}
            disabled={verifying || otp.join('').length < 6}
          >
            {verifying
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</>
              : <><CheckCircle2 className="w-4 h-4 mr-2" /> Verify Email</>}
          </Button>

          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground">Didn't receive the code?</p>
            {cooldown > 0 ? (
              <p className="text-xs text-muted-foreground">Resend in <span className="font-medium text-foreground">{cooldown}s</span></p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1 mx-auto disabled:opacity-50"
              >
                {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                Resend code
              </button>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Wrong account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">Register again</Link>
          </p>
        </div>

        {/* Dev hint */}
        {import.meta.env.DEV && (
          <div className="mt-4 text-center text-[11px] text-muted-foreground space-y-2">
            <p>Development: check the backend console for the OTP if SendGrid is not configured.</p>
            {email && (
              <button
                onClick={fetchDevOtp}
                className="text-xs font-medium text-primary hover:underline"
              >
                Show code (dev)
              </button>
            )}
            {devOtp && (
              <div className="text-sm mt-1 font-mono">Code: {devOtp}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailPage;
