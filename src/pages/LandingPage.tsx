import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import {
  Shield, Eye, Smartphone, Monitor, Brain, BarChart3,
  ArrowRight, ChevronDown, CheckCircle, Star,
  Users, BookOpen, Zap, Lock, Globe, Play, Menu, X, Sun, Moon
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { BrandMark } from '@/components/common/Logo';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FadeUp: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({
  children, delay = 0, className = ''
}) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 36 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const StaggerContainer: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({
  children, className = '', delay = 0
}) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: delay } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const StaggerItem: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 24 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }
    }}
    className={className}
  >
    {children}
  </motion.div>
);

// ─── Sky-blue dot grid (light) ────────────────────────────────────────────────

const DotGrid: React.FC = () => (
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      backgroundImage: 'radial-gradient(circle, rgba(74,144,226,0.08) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    }}
  />
);

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Eye,        title: 'Facial Recognition',    desc: 'Real-time identity verification with MediaPipe & OpenCV. Detects impostor candidates instantly.',  iconBg: 'bg-blue-50 text-primary border-blue-200' },
  { icon: Smartphone, title: 'Object Detection',      desc: 'YOLO-powered detection catches phones, notes, and extra devices with 97% accuracy.',              iconBg: 'bg-red-50 text-red-600 border-red-200' },
  { icon: Eye,        title: 'Eye-Gaze Tracking',     desc: 'Monitors gaze direction continuously. Flags sustained off-screen attention in milliseconds.',   iconBg: 'bg-blue-50 text-primary border-blue-200' },
  { icon: Monitor,    title: 'Tab-Switch Detection',  desc: 'Browser focus monitoring detects every attempt to access external resources or windows.',        iconBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { icon: Brain,      title: 'Head-Pose Estimation',  desc: 'ML-driven head-pose and movement analysis identifies suspicious behaviors throughout the assessment.', iconBg: 'bg-blue-50 text-primary border-blue-200' },
  { icon: BarChart3,  title: 'Risk Scoring Engine',   desc: 'Composite risk score aggregates all signals into a single 0–100 integrity metric per candidate.',  iconBg: 'bg-amber-50 text-amber-700 border-amber-200' },
];

const STEPS = [
  { step: '01', title: 'Register & Verify',      desc: 'Candidates register with biometric face capture. Identity is verified at every assessment session start.', icon: Shield },
  { step: '02', title: 'Take Assessment Securely', desc: 'AI monitoring runs silently in the background. Real-time alerts notify recruiters of any violations.',     icon: BookOpen },
  { step: '03', title: 'Instant Results',        desc: 'Detailed integrity reports with AI detection logs, risk scores, and evidence are generated instantly.',     icon: BarChart3 },
];

const STATS = [
  { value: '94.2%', label: 'Detection Accuracy',     icon: Zap },
  { value: '127+',  label: 'Assessments Monitored',  icon: BookOpen },
  { value: '12',    label: 'Companies',              icon: Globe },
  { value: '4,800+',label: 'Candidates Protected',   icon: Users },
];

const TESTIMONIALS = [
  { name: 'Sarah Williams', role: 'Head of Talent Acquisition',  quote: 'SemanticGuard AI has completely transformed integrity across our hiring assessments. The real-time alerts are a game changer.', rating: 5 },
  { name: 'Michael Brown',  role: 'Technical Recruiter',         quote: 'The fraud-detection engine caught impersonation attempts we would never have spotted manually. Extraordinary accuracy.', rating: 5 },
  { name: 'Lisa Chen',      role: 'HR Director',                 quote: 'The audit logs and detailed reports have made it far easier to ensure fair, transparent candidate selection with solid evidence.', rating: 5 },
];

// ─── Navigation ───────────────────────────────────────────────────────────────

const SKY_BTN = { background: 'hsl(211,73%,59%)', color: '#fff' } as const;

const LandingNav: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // Always show near the top; otherwise hide on scroll down, show on scroll up
      if (y < 80 || y < lastY) setHidden(false);
      else if (y > lastY) setHidden(true);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: hidden ? -120 : 0, opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-sidebar-border/60 shadow-md bg-[hsl(214,68%,19%)] xl:top-4 xl:mx-auto xl:w-[min(1200px,calc(100%-3rem))] xl:rounded-full xl:border xl:border-white/10 xl:border-b"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 xl:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <BrandMark size={30} />
          <span className="font-bold text-sm tracking-wide text-white">
            SemanticGuard <span style={{ color: 'hsl(211,73%,72%)' }}>AI</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-6">
          {[['features', 'Features'], ['how-it-works', 'How It Works'], ['testimonials', 'Testimonials']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="text-sm font-medium transition-colors"
              style={{ color: 'rgba(255,255,255,0.65)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}
            >{label}</button>
          ))}
        </nav>

        {/* Right: theme toggle + Sign In + Get Started */}
        <div className="hidden md:flex items-center gap-2">
          {/* Dark / Light mode toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            {theme === 'dark'
              ? <Sun  className="w-4 h-4 text-white" />
              : <Moon className="w-4 h-4 text-white" />}
          </button>

          <Link
            to="/login"
            className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.75)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
          >
            Sign In
          </Link>

          <Link
            to="/login"
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-85"
            style={SKY_BTN}
          >
            Get Started
          </Link>
        </div>

        {/* Mobile: theme toggle + hamburger */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            {theme === 'dark'
              ? <Sun  className="w-4 h-4 text-white" />
              : <Moon className="w-4 h-4 text-white" />}
          </button>
          <button
            className="text-white/70 hover:text-white transition-colors"
            onClick={() => setMenuOpen(m => !m)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t px-4 pb-4 pt-3 flex flex-col gap-3"
            style={{ background: 'hsl(214,68%,15%)', borderColor: 'rgba(255,255,255,0.10)' }}
          >
            {[['features', 'Features'], ['how-it-works', 'How It Works'], ['testimonials', 'Testimonials']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-sm font-medium text-left py-1 transition-colors"
                style={{ color: 'rgba(255,255,255,0.65)' }}
              >{label}</button>
            ))}
            <Link to="/login"
              className="text-sm font-medium py-1 transition-colors"
              style={{ color: 'rgba(255,255,255,0.65)' }}
            >Sign In</Link>
            <Link to="/login"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white text-center transition-opacity hover:opacity-85"
              style={SKY_BTN}
            >
              Get Started
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

// ─── Hero ──────────────────────────────────────────────────────────────────────

const HeroSection: React.FC = () => {
  const { scrollY } = useScroll();
  const y       = useTransform(scrollY, [0, 400], [0, -60]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background pt-16">
      <DotGrid />

      {/* Sky-blue glow blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-primary/6 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] rounded-full bg-secondary/8 blur-[80px] pointer-events-none z-0" />

      <motion.div style={{ y, opacity }} className="relative z-10 text-center max-w-4xl mx-auto px-4">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/25 bg-primary/8 text-primary text-xs font-semibold mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          AI-Powered Candidate Fraud & Assessment Integrity System
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground leading-[1.1] tracking-tight mb-6 text-balance"
        >
          Stop Cheating{' '}
          <span className="relative inline-block">
            <span className="text-primary">Before</span>
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
              className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary/40 origin-left rounded-full"
            />
          </span>
          {' '}It Starts
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed text-pretty"
        >
          Real-time AI monitoring with facial recognition, eye-gaze tracking, object detection, and head-pose estimation.
          94.2% accuracy. Zero compromise on hiring integrity.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link to="/login">
            <motion.div
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-7 py-3.5 rounded-lg font-semibold text-sm cursor-pointer transition-opacity hover:opacity-90" style={{background:'hsl(211,73%,59%)',color:'white',boxShadow:'0 4px 14px rgba(74,144,226,0.40)'}}
            >
              Get Started Free <ArrowRight className="w-4 h-4" />
            </motion.div>
          </Link>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex items-center gap-2 px-7 py-3.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 text-sm transition-colors font-medium shadow-sm"
          >
            <Play className="w-4 h-4" /> See How It Works
          </motion.button>
        </motion.div>
      </motion.div>
    </section>
  );
};

// ─── Stats Bar ────────────────────────────────────────────────────────────────

const StatsSection: React.FC = () => (
  <section className="bg-background py-10">
    <div className="max-w-6xl mx-auto px-4">
      <div className="bg-[#0f2557] rounded-3xl px-4 py-12 shadow-lg">
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map(({ value, label, icon: Icon }) => (
            <StaggerItem key={label} className="text-center">
              <div className="flex justify-center mb-3">
                <div className="w-10 h-10 rounded-lg border border-white/20 bg-white/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-sky-300" />
                </div>
              </div>
              <p className="text-3xl font-bold text-white font-mono">{value}</p>
              <p className="text-blue-200/70 text-sm mt-1">{label}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </div>
  </section>
);

// ─── Features ─────────────────────────────────────────────────────────────────

const FeaturesSection: React.FC = () => (
  <section id="features" className="bg-background py-24 relative overflow-hidden">
    <DotGrid />
    <div className="absolute top-1/2 left-0 w-64 h-64 bg-primary/5 rounded-full blur-[80px] pointer-events-none z-0" />
    <div className="max-w-6xl mx-auto px-4 relative z-10">
      <FadeUp className="text-center mb-16">
        <span className="inline-block text-primary text-xs font-semibold tracking-widest uppercase mb-4 border border-primary/20 bg-primary/8 px-3 py-1 rounded-full">
          Detection Suite
        </span>
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 text-balance">AI That Never Misses a Beat</h2>
        <p className="text-muted-foreground max-w-xl mx-auto text-pretty">
          Six layers of intelligent monitoring working in parallel to protect recruitment integrity.
        </p>
      </FadeUp>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map(({ icon: Icon, title, desc, iconBg }) => (
          <StaggerItem key={title}>
            <motion.div
              whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(15,45,82,0.10)' }}
              transition={{ duration: 0.2 }}
              className="bg-card border border-border rounded-xl p-5 group h-full"
            >
              <div className={`w-9 h-9 rounded-lg border flex items-center justify-center mb-4 ${iconBg}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-foreground font-semibold text-sm mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed text-pretty">{desc}</p>
              <div className="mt-4 flex items-center gap-1.5 text-primary/70 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span>Active</span>
              </div>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  </section>
);

// ─── How It Works ─────────────────────────────────────────────────────────────

const HowItWorksSection: React.FC = () => (
  <section id="how-it-works" className="bg-card py-24 border-y border-border/60">
    <div className="max-w-5xl mx-auto px-4">
      <FadeUp className="text-center mb-16">
        <span className="inline-block text-primary text-xs font-semibold tracking-widest uppercase mb-4 border border-primary/20 bg-primary/8 px-3 py-1 rounded-full">
          Workflow
        </span>
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 text-balance">Three Steps to Total Integrity</h2>
        <p className="text-muted-foreground max-w-xl mx-auto text-pretty">From registration to results, every step is secured and audited.</p>
      </FadeUp>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-8" delay={0.1}>
        {STEPS.map(({ step, title, desc, icon: Icon }, i) => (
          <StaggerItem key={step} className="relative">
            {i < STEPS.length - 1 && (
              <div className="hidden md:block absolute top-8 left-[calc(100%+1rem)] w-[calc(100%-2rem)] h-px bg-gradient-to-r from-primary/30 to-transparent pointer-events-none" />
            )}
            <div className="flex flex-col items-start gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-xl border border-primary/20 bg-primary/8 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center font-mono">
                  {i + 1}
                </div>
              </div>
              <div>
                <div className="text-primary/50 text-xs font-mono mb-1">{step}</div>
                <h3 className="text-foreground font-semibold text-lg mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed text-pretty">{desc}</p>
              </div>
            </div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  </section>
);

// ─── Testimonials ─────────────────────────────────────────────────────────────

const TestimonialsSection: React.FC = () => (
  <section id="testimonials" className="bg-background py-24 relative overflow-hidden">
    <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
    <div className="max-w-6xl mx-auto px-4 relative z-10">
      <FadeUp className="text-center mb-16">
        <span className="inline-block text-primary text-xs font-semibold tracking-widest uppercase mb-4 border border-primary/20 bg-primary/8 px-3 py-1 rounded-full">
          Testimonials
        </span>
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 text-balance">Trusted by Hiring Teams</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">Real feedback from companies using SemanticGuard AI in production.</p>
      </FadeUp>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TESTIMONIALS.map(({ name, role, quote, rating }) => (
          <StaggerItem key={name}>
            <motion.div
              whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(15,45,82,0.10)' }}
              transition={{ duration: 0.2 }}
              className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4 h-full"
            >
              <div className="flex gap-0.5">
                {Array.from({ length: rating }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1 text-pretty">"{quote}"</p>
              <div className="flex items-center gap-3 pt-3 border-t border-border/60">
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                  {name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-semibold truncate">{name}</p>
                  <p className="text-muted-foreground/70 text-xs truncate">{role}</p>
                </div>
              </div>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  </section>
);

// ─── CTA ──────────────────────────────────────────────────────────────────────

const CTASection: React.FC = () => (
  <section className="bg-card border-t border-border/60 py-24 relative overflow-hidden">
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-[600px] h-[400px] rounded-full bg-primary/5 blur-[100px]" />
    </div>
    <FadeUp className="relative z-10 max-w-2xl mx-auto px-4 text-center">
      <div className="w-14 h-14 rounded-xl border border-primary/20 bg-primary/8 flex items-center justify-center mx-auto mb-6">
        <Lock className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 text-balance">
        Ready to Secure Your Assessments?
      </h2>
      <p className="text-muted-foreground mb-8 text-pretty">
        Join the companies using SemanticGuard AI to verify candidate identity and uphold hiring integrity.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link to="/login">
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm cursor-pointer transition-opacity hover:opacity-90" style={{background:'hsl(211,73%,59%)',color:'white',boxShadow:'0 4px 14px rgba(74,144,226,0.40)'}}
          >
            Get Started Now <ArrowRight className="w-4 h-4" />
          </motion.div>
        </Link>
        <Link to="/register" className="text-sm text-muted-foreground hover:text-foreground font-medium transition-colors">
          Create free account →
        </Link>
      </div>
    </FadeUp>
  </section>
);

// ─── Footer ───────────────────────────────────────────────────────────────────

const Footer: React.FC = () => (
  <footer className="bg-sidebar border-t border-sidebar-border py-8">
    <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <BrandMark size={22} />
        <span className="text-sidebar-foreground/70 text-sm font-medium">SemanticGuard <span className="text-sidebar-primary">AI</span></span>
      </div>
      <p className="text-sidebar-foreground/40 text-xs">© 2026 SemanticGuard AI · Semantic Services Rwanda</p>
      <div className="flex gap-5">
        {['Privacy', 'Terms', 'Support'].map(l => (
          <Link key={l} to="/login" className="text-sidebar-foreground/40 hover:text-sidebar-foreground/70 text-xs transition-colors">{l}</Link>
        ))}
      </div>
    </div>
  </footer>
);

// ─── Page ──────────────────────────────────────────────────────────────────────

const LandingPage: React.FC = () => (
  <div className="min-h-screen font-sans bg-background">
    <LandingNav />
    <HeroSection />
    <StatsSection />
    <FeaturesSection />
    <HowItWorksSection />
    <TestimonialsSection />
    <CTASection />
    <Footer />
  </div>
);

export default LandingPage;
